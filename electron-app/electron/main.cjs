'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, ipcMain, shell } = require('electron');

const APP_ROOT = path.resolve(__dirname, '..');
const DICTIONARY_FILE = path.join(APP_ROOT, 'data', 'dictionary.json');
const ICON_PNG = path.join(APP_ROOT, 'build', 'icon.png');
const ICON_ICO = path.join(APP_ROOT, 'build', 'icon.ico');
let mainWindow = null;
let dictionaryCache = null;

// Janela sem moldura, preservando borda redimensionável e cantos nativos do Win 11.
function createWindow() {
  const window = new BrowserWindow({
    title: 'Termo',
    width: 1160,
    height: 820,
    minWidth: 660,
    minHeight: 560,
    center: true,
    show: false,
    frame: false,
    roundedCorners: true,
    thickFrame: true,
    backgroundColor: '#6e5c62',
    autoHideMenuBar: true,
    icon: fs.existsSync(process.platform === 'win32' ? ICON_ICO : ICON_PNG)
      ? (process.platform === 'win32' ? ICON_ICO : ICON_PNG)
      : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  mainWindow = window;

  const notifyWindowState = () => {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send('termo-window:state', {
        maximized: window.isMaximized(),
        fullScreen: window.isFullScreen()
      });
    }
  };
  for (const eventName of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) {
    window.on(eventName, notifyWindowState);
  }

  window.once('ready-to-show', () => {
    if (!window.isDestroyed()) window.show();
  });
  window.webContents.on('did-finish-load', notifyWindowState);

  // Recursos do jogo permanecem locais. Links externos só abrem no navegador padrão.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/github\.com\/fserb\/pt-br(?:\/|$|[?#])/i.test(url)) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, navigationUrl) => {
    if (navigationUrl !== window.webContents.getURL()) event.preventDefault();
  });

  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });
  window.loadFile(path.join(APP_ROOT, 'index.html'));
  if (process.argv.includes('--devtools')) window.webContents.openDevTools({ mode: 'detach' });
  return window;
}

function controlledWindow(event) {
  const win = BrowserWindow.fromWebContents(event.sender);
  // O controlador de janelas só é exposto à interface local da janela principal.
  return win && win === mainWindow && !win.isDestroyed() ? win : null;
}

ipcMain.handle('termo-window:action', (event, action) => {
  const win = controlledWindow(event);
  if (!win) return false;
  switch (action) {
    case 'minimize': win.minimize(); return true;
    case 'maximize':
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
      return true;
    case 'close': win.close(); return true;
    default: return false;
  }
});

ipcMain.handle('termo-window:state', event => {
  const win = controlledWindow(event);
  return { maximized: !!win?.isMaximized(), fullScreen: !!win?.isFullScreen() };
});

ipcMain.handle('termo-dictionary:load', event => {
  if (!controlledWindow(event)) throw new Error('Acesso não autorizado ao dicionário');
  if (!dictionaryCache) {
    // Versão JSON exportada pelo mesmo script que cria o SQLite. Sem servidor.
    dictionaryCache = JSON.parse(fs.readFileSync(DICTIONARY_FILE, 'utf8'));
  }
  return dictionaryCache;
});

if (process.platform === 'win32') app.setAppUserModelId('com.termoilimitado.desktop');
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
