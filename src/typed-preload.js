'use strict';
// Sidebar apps and AI chats (their own sessions, without the tab preloads): marks fields you typed in, so a memory
// limit never throws away a half-written message (renderer.js memChoices). Same marker as drag-preload.js.
const { ipcRenderer } = require('electron');
addEventListener('input', (e) => { if (e.isTrusted && e.target && e.target.dataset) e.target.dataset.sbTyped = '1'; }, true);
if (window.top !== window) { let told = false; addEventListener('input', (e) => { if (e.isTrusted && !told) { told = true; ipcRenderer.send('tab:typed'); } }, true); }
