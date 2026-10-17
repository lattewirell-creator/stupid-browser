'use strict';
// Bridge for stupid:// pages (settings, history, downloads, bookmarks, new tab).
// Only exposed when the page really is an internal page; main re-checks the sender URL too.
const { contextBridge, ipcRenderer } = require('electron');
if (location.protocol === 'stupid:') {
  const INVOKE = [
    'settings:get', 'settings:set', 'settings:reset', 'bookmarks:get', 'bookmarks:set', 'bots:get', 'bots:set', 'bots:defaults',
    'sidebar:get', 'sidebar:set', 'sidebar:defaults',
    'history:query', 'history:delete', 'downloads:list', 'downloads:action', 'downloads:clear', 'downloads:chooseDir',
    'perms:get', 'perms:set', 'privacy:clear', 'adblock:set', 'adblock:get', 'pw:list', 'pw:reveal', 'pw:delete', 'pw:encryption',
    'import:sources', 'import:browser', 'import:file', 'import:passwords', 'buddy:status', 'buddy:setKey', 'buddy:models', 'background:get', 'background:set', 'widgets:get', 'widgets:set', 'default:status', 'default:set', 'about:info', 'win:new', 'update:status', 'update:check', 'update:install'
  ];
  const EVENTS = ['settings:changed', 'bookmarks:changed', 'bots:changed', 'sidebar:changed', 'downloads:started', 'downloads:update', 'downloads:removed', 'downloads:cleared', 'perms:changed', 'passwords:changed', 'adblock:count', 'update:status', 'widgets:changed', 'background:changed'];
  contextBridge.exposeInMainWorld('stupid', {
    platform: process.platform,
    invoke: (ch, ...args) => (INVOKE.includes(ch) ? ipcRenderer.invoke(ch, ...args) : Promise.reject(new Error('blocked ' + ch))),
    on: (ch, fn) => { if (EVENTS.includes(ch)) ipcRenderer.on(ch, (_e, ...a) => fn(...a)); }
  });
}
