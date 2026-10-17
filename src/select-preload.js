'use strict';
// Tells the browser UI about highlighted text in a web page so it can offer "Ask Buddy",
// and turns the mouse's back/forward side buttons into navigation on macOS.
// Only the selected text and where it is on screen are sent, and only to this browser's own window.
const { ipcRenderer } = require('electron');
if (window.top === window && /^https?:$/.test(location.protocol)) {
  let t = 0, had = false;
  const send = () => {
    const s = window.getSelection();
    const text = s && s.rangeCount ? String(s).trim() : '';
    if (text.length < 2) { if (had) { had = false; ipcRenderer.sendToHost('stupid-sel', null); } return; }
    const r = s.getRangeAt(0).getBoundingClientRect();
    had = true;
    ipcRenderer.sendToHost('stupid-sel', { text: text.slice(0, 2000), x: r.left, y: r.top, w: r.width, h: r.height });
  };
  const later = (ms) => { clearTimeout(t); t = setTimeout(send, ms); };
  document.addEventListener('mouseup', () => later(10), true);
  document.addEventListener('keyup', (e) => { if (e.shiftKey || e.key === 'Shift') later(150); }, true);
  document.addEventListener('selectionchange', () => { if (had && !String(window.getSelection() || '').trim()) later(0); });
  // Mouse side buttons → back / forward (Windows does this itself; macOS doesn't in web pages).
  if (process.platform === 'darwin') window.addEventListener('mouseup', (e) => { if (e.button === 3 || e.button === 4) { e.preventDefault(); ipcRenderer.sendToHost('stupid-nav', e.button === 3 ? 'back' : 'forward'); } }, true);
  window.addEventListener('scroll', () => { if (had) { had = false; ipcRenderer.sendToHost('stupid-sel', null); } }, { passive: true, capture: true });
}
