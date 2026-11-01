'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const ACTIONS = new Set(['minimize', 'maximize', 'close']);

// Não exporta Node, Electron ou IPC genérico para a página.
contextBridge.exposeInMainWorld('termoDesktop', Object.freeze({
  windowAction: action => ACTIONS.has(action)
    ? ipcRenderer.invoke('termo-window:action', action)
    : Promise.resolve(false),
  windowState: () => ipcRenderer.invoke('termo-window:state'),
  onWindowState: callback => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, state) => callback({
      maximized: !!state?.maximized,
      fullScreen: !!state?.fullScreen
    });
    ipcRenderer.on('termo-window:state', handler);
    return () => ipcRenderer.removeListener('termo-window:state', handler);
  },
  loadDictionary: () => ipcRenderer.invoke('termo-dictionary:load')
}));
