'use strict';
// Bridge for the browser UI (shell window). Only whitelisted channels are reachable.
const { contextBridge, ipcRenderer } = require('electron');
const INVOKE = [
  'win:info', 'settings:get', 'settings:set', 'bookmarks:get', 'bookmarks:set', 'bookmarks:folderMenu',
  'bots:get', 'bots:set', 'bots:defaults', 'sidebar:get', 'sidebar:set', 'sidebar:defaults',
  'history:suggest', 'downloads:list', 'downloads:action', 'downloads:clear',
  'perm:respond', 'perms:get', 'perms:set', 'site:clearData', 'adblock:set', 'adblock:get',
  'rewind:capture', 'rewind:status', 'win:trafficLights', 'profiles:list', 'profiles:open', 'profiles:create', 'profiles:remove', 'buddy:status', 'buddy:ask', 'buddy:reset', 'buddy:stop', 'launcher:get', 'launcher:set', 'launcher:defaults', 'session:save', 'win:new', 'win:fullscreen', 'win:close', 'pw:respond', 'update:status', 'update:check', 'update:install', 'shell:editMenu', 'clipboard:write'
];
const EVENTS = [
  'shortcut', 'open-url', 'reopen-plain', 'paste-go', 'settings:changed', 'bookmarks:changed', 'bots:changed', 'sidebar:changed',
  'downloads:started', 'downloads:update', 'downloads:removed', 'downloads:cleared', 'perm:prompt', 'perms:changed',
  'adblock:count', 'buddy:delta', 'launcher:changed', 'pw:offer', 'fullscreen', 'update:status', 'win:focus'
];
contextBridge.exposeInMainWorld('stupid', {
  platform: process.platform,
  invoke: (ch, ...args) => (INVOKE.includes(ch) ? ipcRenderer.invoke(ch, ...args) : Promise.reject(new Error('blocked ' + ch))),
  on: (ch, fn) => { if (EVENTS.includes(ch)) ipcRenderer.on(ch, (_e, ...a) => fn(...a)); }
});
