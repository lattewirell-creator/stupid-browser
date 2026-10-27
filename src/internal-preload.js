'use strict';
// Bridge for stupid:// pages (settings, history, downloads, bookmarks, new tab).
// Only exposed when the page really is an internal page; main re-checks the sender URL too.
const { contextBridge, ipcRenderer } = require('electron');
if (location.protocol === 'stupid:') {
  const INVOKE = [
    'settings:get', 'settings:set', 'settings:reset', 'bookmarks:get', 'bookmarks:set', 'bots:get', 'bots:set', 'bots:defaults',
    'sidebar:get', 'sidebar:set', 'sidebar:defaults',
    'history:query', 'history:delete', 'downloads:list', 'downloads:action', 'downloads:clear', 'downloads:chooseDir', 'downloads:drag',
    'perms:get', 'perms:set', 'privacy:clear', 'adblock:set', 'adblock:get', 'pw:list', 'pw:reveal', 'pw:delete', 'pw:encryption',
    'rewind:search', 'rewind:status', 'rewind:delete', 'rewind:clear', 'profiles:picker', 'import:sources', 'import:browser', 'import:safariAccess', 'import:file', 'import:passwords', 'buddy:status', 'buddy:setKey', 'buddy:models', 'buddy:search', 'background:get', 'background:set', 'widgets:get', 'widgets:set', 'default:status', 'default:set', 'about:info', 'win:new', 'update:status', 'update:check', 'update:install'
  ];
  const EVENTS = ['ask:progress', 'settings:changed', 'bookmarks:changed', 'bots:changed', 'sidebar:changed', 'downloads:started', 'downloads:update', 'downloads:removed', 'downloads:cleared', 'perms:changed', 'passwords:changed', 'adblock:count', 'update:status', 'widgets:changed', 'background:changed', 'rewind:changed'];
  contextBridge.exposeInMainWorld('stupid', {
    platform: process.platform,
    invoke: (ch, ...args) => (INVOKE.includes(ch) ? ipcRenderer.invoke(ch, ...args) : Promise.reject(new Error('blocked ' + ch))),
    on: (ch, fn) => { if (EVENTS.includes(ch)) ipcRenderer.on(ch, (_e, ...a) => fn(...a)); }
  });
}
