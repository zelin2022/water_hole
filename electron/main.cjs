const { app, BrowserWindow, ipcMain, screen, shell } = require('electron');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

app.setName('Water Hole');
const dev = !app.isPackaged && process.argv.includes('--dev');
const entryFile = path.join(__dirname, '../dist/index.html');
const entryURL = dev ? 'http://127.0.0.1:5173/' : pathToFileURL(entryFile).href;
const sizes = new Set(['1024x720', '1280x800', '1600x900', '1920x1080']);
let mainWindow = null;
let displayQueue = Promise.resolve();

function safeExternalURL(value) {
  if (typeof value !== 'string' || value.trim() !== value || /[\\\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash ? url.href : null;
  } catch { return null; }
}

let externalLinks = new Set();
try {
  const links = JSON.parse(readFileSync(path.join(__dirname, '../dist/release-links.json'), 'utf8'));
  if (Array.isArray(links)) externalLinks = new Set(links.map(safeExternalURL).filter(Boolean));
} catch { /* An absent or invalid manifest disables external links. */ }

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
ipcMain.handle('water-hole:open-external', async (event, requestedURL) => {
  if (!trustedSender(event)) throw new Error('External links require the game window.');
  const url = safeExternalURL(requestedURL);
  if (!url || !externalLinks.has(url)) throw new Error('This link is not configured for this build.');
  await shell.openExternal(url);
});

function createWindow() {
  const available = screen.getPrimaryDisplay().workAreaSize;
  const window = new BrowserWindow({
    title: 'Water Hole Demo',
    icon: path.join(__dirname, '../dist/app-icon.png'),
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
