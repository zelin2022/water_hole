const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

async function desktop({ platform = 'win32', packaged = true, argv = [] } = {}) {
  const handlers = new Map();
  let window;
  let quit = false;
  class FakeWindow extends EventEmitter {
    constructor(options) {
      super(); window = this; this.options = options; this.fullscreen = false;
      this.bounds = { x: 0, y: 0, width: options.width, height: options.height };
      this.operations = [];
      this.webContents = new EventEmitter();
      this.webContents.mainFrame = {};
      this.webContents.setWindowOpenHandler = handler => { this.openHandler = handler; };
      this.webContents.getURL = () => this.url;
    }
    loadURL(url) { this.url = url; }
    loadFile(file) { this.url = pathToFileURL(file).href; }
    getBounds() { return this.bounds; }
    setSize(width, height) { this.bounds.width = width; this.bounds.height = height; this.operations.push('resize'); }
    setMinimumSize() {}
    isFullScreen() { return this.fullscreen; }
    setFullScreen(value) {
      this.operations.push(value ? 'enter-request' : 'leave-request');
      const finish = () => {
        this.fullscreen = value;
        this.operations.push(value ? 'entered' : 'left');
        this.emit(value ? 'enter-full-screen' : 'leave-full-screen');
      };
      if (platform === 'darwin') setImmediate(finish);
      else finish();
    }
    center() {}
    static getAllWindows() { return window ? [window] : []; }
  }
  const app = { isPackaged: packaged, whenReady: () => Promise.resolve(), on: () => {},
    quit: () => { quit = true; }, setName: name => { app.name = name; } };
  const electron = {
    app, BrowserWindow: FakeWindow,
    ipcMain: { handle: (channel, fn) => handlers.set(channel, fn), on: (channel, fn) => handlers.set(channel, fn) },
    screen: {
      getDisplayMatching: () => ({ workAreaSize: { width: 1100, height: 760 } }),
      getPrimaryDisplay: () => ({ workAreaSize: { width: 1100, height: 760 } }),
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'electron/main.cjs'), 'utf8'), {
    require: name => name === 'electron' ? electron : require(name),
    __dirname: path.join(root, 'electron'), process: { argv, platform }, console, setTimeout, clearTimeout,
  });
  await new Promise(resolve => setImmediate(resolve));
  return {
    window, app,
    display: handlers.get('water-hole:set-display'),
    requestQuit: handlers.get('water-hole:quit'),
    event: { sender: window.webContents, senderFrame: window.webContents.mainFrame },
    hasQuit: () => quit,
  };
}

const preset = { fullscreen: false, width: 1024, height: 720 };

test('native operations require the current game main frame and entry URL', async () => {
  const game = await desktop();
  for (const event of [
    { sender: {}, senderFrame: {} },
    { sender: game.window.webContents, senderFrame: {} },
  ]) {
    await assert.rejects(() => game.display(event, preset));
    game.requestQuit(event);
    assert.equal(game.hasQuit(), false);
  }
  game.window.url = 'https://example.com/';
  await assert.rejects(() => game.display(game.event, preset));
  game.requestQuit(game.event);
  assert.equal(game.hasQuit(), false);
  assert.equal(game.window.operations.length, 0);
});

test('rejects malformed display requests before changing the native window', async () => {
  const game = await desktop();
  for (const request of [null, {}, { ...preset, fullscreen: 'false' },
    { ...preset, width: 1234 }, { ...preset, width: Infinity }, { ...preset, height: 720.5 }]) {
    await assert.rejects(() => game.display(game.event, request));
  }
  assert.equal(game.window.operations.length, 0);
});

test('accepts supported presets, clamps them to available space, and supports fullscreen', async () => {
  const game = await desktop();
  await game.display(game.event, { fullscreen: false, width: 1920, height: 1080 });
  assert.equal(game.window.bounds.width, 1100);
  assert.equal(game.window.bounds.height, 760);
  await game.display(game.event, preset);
  assert.equal(game.window.bounds.width, 1024);
  assert.equal(game.window.bounds.height, 720);
  await game.display(game.event, { ...preset, fullscreen: true });
  assert.equal(game.window.fullscreen, true);
  await game.display(game.event, preset);
  assert.equal(game.window.fullscreen, false);
  game.requestQuit(game.event);
  assert.equal(game.hasQuit(), true);
});

test('waits for the asynchronous macOS fullscreen exit before resizing', async () => {
  const game = await desktop({ platform: 'darwin' });
  await game.display(game.event, { ...preset, fullscreen: true });
  game.window.operations.length = 0;
  await game.display(game.event, preset);
  assert.deepEqual(game.window.operations, ['leave-request', 'left', 'resize']);
});

test('a packaged app uses local content even with --dev and keeps renderer isolation', async () => {
  const game = await desktop({ packaged: true, argv: ['--dev'] });
  assert.equal(game.window.url, pathToFileURL(path.join(root, 'dist/index.html')).href);
  assert.equal(game.app.name, 'Water Hole');
  const preferences = game.window.options.webPreferences;
  assert.equal(preferences.nodeIntegration, false);
  assert.equal(preferences.contextIsolation, true);
  assert.equal(preferences.sandbox, true);
  assert.equal(preferences.preload, path.join(root, 'electron/preload.cjs'));
  assert.equal(game.window.openHandler().action, 'deny');
});

test('preload exposes only bounded display and quit methods, without raw Electron APIs', async () => {
  let exposed;
  const calls = [];
  vm.runInNewContext(fs.readFileSync(path.join(root, 'electron/preload.cjs'), 'utf8'), {
    require: () => ({
      contextBridge: { exposeInMainWorld: (name, api) => { assert.equal(name, 'waterHoleDesktop'); exposed = api; } },
      ipcRenderer: { invoke: async (...args) => { calls.push(args); }, send: (...args) => { calls.push(args); } },
    }),
  });
  assert.deepEqual(Object.keys(exposed).sort(), ['quit', 'setDisplay']);
  await exposed.setDisplay({ ...preset, extra: 'must not cross the bridge' });
  exposed.quit();
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    ['water-hole:set-display', preset], ['water-hole:quit'],
  ]);
});
