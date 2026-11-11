'use strict';
// Bridge for the browser UI (shell window). Only whitelisted channels are reachable.
const { contextBridge, ipcRenderer, webUtils } = require('electron');
const INVOKE = [
  'win:info', 'settings:get', 'settings:set', 'bookmarks:get', 'bookmarks:set', 'bookmarks:folderMenu',
  'bots:get', 'bots:set', 'bots:defaults', 'sidebar:get', 'sidebar:set', 'sidebar:defaults',
  'history:suggest', 'downloads:list', 'downloads:action', 'downloads:clear', 'downloads:drag',
  'perm:respond', 'perms:get', 'perms:set', 'site:clearData', 'adblock:set', 'adblock:get', 'vpn:status', 'vpn:open', 'update:justUpdated', 'peek:mark', 'tab:history', 'tab:history:pending', 'tab:typedInFrame', 'ext:active', 'ext:tabCreated', 'profile:pickImage', 'test:popups', 'test:popupClickHelp', 'test:popupPost',
  'rewind:capture', 'rewind:status', 'win:trafficLights', 'profiles:list', 'profiles:open', 'profiles:create', 'profiles:remove', 'buddy:status', 'buddy:ask', 'buddy:reset', 'buddy:stop', 'launcher:get', 'launcher:set', 'launcher:defaults', 'session:save', 'win:new', 'win:fullscreen', 'win:close', 'pw:respond', 'card:respond', 'update:status', 'update:check', 'update:install', 'shell:editMenu', 'clipboard:write', 'net:preconnect', 'tab:memory', 'shot:take', 'shot:drag', 'shot:save', 'rec:source', 'rec:save'
];
const EVENTS = [
  'shortcut', 'open-url', 'update:installing', 'ext:createTab', 'ext:selectTab', 'ext:closeTab', 'reopen-plain', 'paste-go', 'settings:changed', 'bookmarks:changed', 'bots:changed', 'sidebar:changed',
  'downloads:started', 'downloads:update', 'downloads:removed', 'downloads:cleared', 'perm:prompt', 'perms:changed',
  'adblock:count', 'consent:declined', 'gesture', 'buddy:delta', 'launcher:changed', 'pw:offer', 'card:offer', 'fullscreen', 'update:status', 'win:focus', 'win:minimized', 'tab:audio'
];
contextBridge.exposeInMainWorld('stupid', {
  platform: process.platform,
  // Where a dropped file is on the computer (to open it in a tab); the page itself never learns paths.
  pathForFile: (f) => { try { return webUtils.getPathForFile(f) || ''; } catch { return ''; } },
  invoke: (ch, ...args) => (INVOKE.includes(ch) ? ipcRenderer.invoke(ch, ...args) : Promise.reject(new Error('blocked ' + ch))),
  on: (ch, fn) => { if (EVENTS.includes(ch)) ipcRenderer.on(ch, (_e, ...a) => fn(...a)); }
});
