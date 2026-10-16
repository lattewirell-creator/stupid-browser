'use strict';
// Bridge for the browser UI (shell window). Only whitelisted channels are reachable.
const { contextBridge, ipcRenderer } = require('electron');
const INVOKE = [
  'win:info', 'settings:get', 'settings:set', 'bookmarks:get', 'bookmarks:set', 'bookmarks:folderMenu',
  'bots:get', 'bots:set', 'bots:defaults', 'sidebar:get', 'sidebar:set', 'sidebar:defaults',
  'history:suggest', 'downloads:list', 'downloads:action', 'downloads:clear',
  'perm:respond', 'perms:get', 'perms:set', 'site:clearData', 'adblock:set', 'adblock:get',
  'session:save', 'win:new', 'win:fullscreen', 'win:close', 'pw:respond', 'update:status', 'update:check', 'update:install'
];
const EVENTS = [
  'shortcut', 'open-url', 'reopen-plain', 'settings:changed', 'bookmarks:changed', 'bots:changed', 'sidebar:changed',
  'downloads:started', 'downloads:update', 'downloads:removed', 'downloads:cleared', 'perm:prompt', 'perms:changed',
  'adblock:count', 'pw:offer', 'fullscreen', 'update:status'
];
contextBridge.exposeInMainWorld('stupid', {
  platform: process.platform,
  invoke: (ch, ...args) => (INVOKE.includes(ch) ? ipcRenderer.invoke(ch, ...args) : Promise.reject(new Error('blocked ' + ch))),
  on: (ch, fn) => { if (EVENTS.includes(ch)) ipcRenderer.on(ch, (_e, ...a) => fn(...a)); }
});
