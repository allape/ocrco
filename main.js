// Allowed envars
// OCRCO_URL: default URL to load in the window

const os = require('os');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const { app, dialog, ipcMain, globalShortcut, BrowserWindow } = require('electron');
const logger = require('electron-log');

/**
 * @param {WebContents} webContents
 * @return {Promise<Buffer | null>}
 * @throws {Error}
 */
async function captureActiveWindow(webContents) {
  const url = new URL(webContents.getURL());
  if (!AllowedHostnames.includes(url.hostname)) {
    return null;
  }

  switch (process.platform) {
    case 'darwin':
      const activeWindow = require('active-win');
      const activeWin = await activeWindow({
        accessibilityPermission: true,
        screenRecordingPermission: false,
      });
      cp.execSync(`screencapture -l ${activeWin.id} -o ${TempCapturedFile}`);
      try {
        return fs.readFileSync(TempCapturedFile);
      } finally {
        fs.unlinkSync(TempCapturedFile);
      }
    case 'win32':
      const ss = require('windows-ss');
      return ss.captureActiveWindow();
    default:
      dialog.showMessageBoxSync({
        type: 'error',
        title: 'Error',
        buttons: ['Well...'],
        message: `This feature is not supported on this platform: ${process.platform}`,
      });
      return null;
  }
}

/**
 * @type {Electron.CrossProcessExports.BrowserWindow | null}
 */
let MainWindow = null;

/**
 * Hostnames those are allowed to use OCR API
 * @type {string[]}
 */
const AllowedHostnames = [
  'localhost',
  '::1',
  '127.0.0.1',
];

const TempFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'ocrco-'));
const TempCapturedFile = `${TempFolder}/capture.png`;

logger.info('temporary folder:', TempFolder);

function preCheck() {
  if (process.platform === 'darwin') {
    // ask for screen recording permission
    try {
      cp.execSync(`screencapture -m ${TempCapturedFile}`);
    } catch (e) {
      logger.warn('ask for screen recording permission is triggered');
    }
  }
}

function registerGlobalShortcut() {
  const ret = globalShortcut.register('CommandOrControl+Shift+Enter',  async () => {
    if (!MainWindow) {
      return;
    }
    MainWindow.webContents.send('captureActiveWindow', await captureActiveWindow(MainWindow.webContents));
  });

  if (!ret) {
    console.log('registration failed')
  }
}

function createMainWindow() {
  MainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    simpleFullscreen: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (process.env.OCRCO_URL) {
    MainWindow.loadURL(process.env.OCRCO_URL).then();
  } else {
    MainWindow.loadFile('index.html').then();
  }

  MainWindow.webContents.on('did-navigate', (e, urlInString) => {
    try {
      const url = new URL(urlInString);

      // Always allow file protocol to use OCR API
      if (url.protocol === 'file:') return;

      if (!AllowedHostnames.includes(url.hostname)) {
        const choice = dialog.showMessageBoxSync({
          type: 'question',
          buttons: ['Yes', 'No'],
          title: 'Confirm',
          message: `Do you want to allow "${url.hostname}" to use OCR API?`,
        });
        if (choice === 0) {
          AllowedHostnames.push(url.hostname);
          logger.info('added hostname:', url.hostname);
        }
      }
    } catch (e) {
      logger.error('failed to parse url:', urlInString);
    }
  });
}

app.whenReady().then(() => {
  preCheck();
  createMainWindow();

  registerGlobalShortcut();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    fs.rmdirSync(TempFolder, { recursive: true });
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });
});

ipcMain.handle('captureActiveWindow', async (e) => {
  return captureActiveWindow(e.sender);
});
