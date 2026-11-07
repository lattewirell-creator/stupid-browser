'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('buddy', {
  minimize: () => ipcRenderer.send('win:minimize'),
  maximize: () => ipcRenderer.send('win:maximize'),
  close: () => ipcRenderer.send('win:close'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  ask: (question, page) => ipcRenderer.invoke('ai:ask', { question, page }),
  onOpenTab: (fn) => ipcRenderer.on('tab:open', (_e, url) => fn(url)),
  onMaximized: (fn) => ipcRenderer.on('win:maximized', (_e, v) => fn(v))
});
