const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

app.setName('Water Hole');
const dev = !app.isPackaged && process.argv.includes('--dev');
const entryFile = path.join(__dirname, '../dist/index.html');
const entryURL = dev ? 'http://127.0.0.1:5173/' : pathToFileURL(entryFile).href;
const sizes = new Set(['1024x720', '1280x800', '1600x900', '1920x1080']);
let mainWindow = null;
let displayQueue = Promise.resolve();

function trustedSender(event) {
  return mainWindow && event.sender === mainWindow.webContents
    && event.senderFrame === mainWindow.webContents.mainFrame
    && event.sender.getURL() === entryURL;
}

function changeFullscreen(window, enabled) {
  if (window.isFullScreen() === enabled) return Promise.resolve();
  if (process.platform !== 'darwin') {
    window.setFullScreen(enabled);
    return Promise.resolve();
  }
  // macOS changes Spaces asynchronously; resize only after leaving fullscreen.
  return new Promise((resolve, reject) => {
    const eventName = enabled ? 'enter-full-screen' : 'leave-full-screen';
    const finished = () => { clearTimeout(timeout); resolve(); };
    const timeout = setTimeout(() => {
      window.removeListener(eventName, finished);
      reject(new Error('The fullscreen transition did not finish.'));
    }, 5000);
    window.once(eventName, finished);
    window.setFullScreen(enabled);
  });
}

ipcMain.handle('water-hole:set-display', async (event, options) => {
  if (!trustedSender(event)) throw new Error('Display settings require the game window.');
  if (!options || typeof options.fullscreen !== 'boolean'
    || !Number.isInteger(options.width) || !Number.isInteger(options.height)
    || !sizes.has(`${options.width}x${options.height}`)) throw new Error('Unsupported display settings.');
  const window = mainWindow;
  const apply = async () => {
    if (options.fullscreen) {
      await changeFullscreen(window, true);
      return;
    }
    await changeFullscreen(window, false);
    const available = screen.getDisplayMatching(window.getBounds()).workAreaSize;
    window.setMinimumSize(Math.min(900, available.width), Math.min(600, available.height));
    window.setSize(Math.min(options.width, available.width), Math.min(options.height, available.height));
    window.center();
  };
  displayQueue = displayQueue.catch(() => {}).then(apply);
  await displayQueue;
});
ipcMain.on('water-hole:quit', (event) => {
  if (trustedSender(event)) app.quit();
});

function createWindow() {
  const available = screen.getPrimaryDisplay().workAreaSize;
  const window = new BrowserWindow({
    title: 'Water Hole Demo',
    width: Math.min(1280, available.width),
    height: Math.min(800, available.height),
    minWidth: Math.min(900, available.width),
    minHeight: Math.min(600, available.height),
    backgroundColor: '#10191d',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  mainWindow = window;
  window.on('closed', () => { if (mainWindow === window) mainWindow = null; });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  if (dev) window.loadURL(entryURL);
  else window.loadFile(entryFile);
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
