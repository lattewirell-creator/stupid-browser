'use strict';
// Bridge for the "Who's browsing?" profile picker window.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('picker', {
  platform: process.platform,
  list: () => ipcRenderer.invoke('picker:list'),
  choose: (id) => ipcRenderer.invoke('picker:choose', id),
  add: (p) => ipcRenderer.invoke('picker:add', p),
  setShow: (on) => ipcRenderer.invoke('picker:show', on)
});
