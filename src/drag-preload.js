'use strict';
// Runs in web pages (isolated world). Dragging a picture takes the picture itself along as a real file, so you can
// drop it in a chat or an upload box in another tab, on the desktop or in another app (Chromium alone only carries
// its address). The file is fetched as you press on the picture, so the drag starts at once. Pages that make their
// own pictures draggable (galleries you sort, editors) keep their own behaviour.
const { ipcRenderer } = require('electron');
// You typed in a field (a real key press, not a value the page set): it's marked, so a tab with your half-written
// text is never put to sleep (renderer.js sleepTab). Every page, internal ones too.
addEventListener('input', (e) => { if (e.isTrusted && e.target && e.target.dataset) e.target.dataset.sbTyped = '1'; }, true);
// Peek: Shift-click a link and it opens in a floating preview over the page instead of a new window (Arc / Zen style).
// Only real clicks on plain web links; pages that use Shift-click themselves (editors, selections in lists) keep it
// as long as they handle it first (we listen on the window, after the page's own handlers on the element).
addEventListener('click', (e) => {
  if (!e.isTrusted || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.button !== 0 || e.defaultPrevented) return;
  const a = e.target && e.target.closest && e.target.closest('a[href]');
  if (!a || a.isContentEditable || a.closest('[contenteditable="true"]') || a.hasAttribute('download')) return;
  let url; try { url = new URL(a.href, location.href); } catch { return; }
  if (!/^https?:$/.test(url.protocol)) return;
  e.preventDefault(); e.stopPropagation();
  ipcRenderer.send('peek:open', url.href);
}, false);
if (/^(https?|file):$/.test(location.protocol)) {
  const srcOf = (img) => img.currentSrc || img.src || '';
  const ours = (img) => img && img.tagName === 'IMG' && srcOf(img) && img.draggable !== false && !img.closest('[draggable="true"]');
  addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !ours(e.target)) return;
    const s = srcOf(e.target);
    if (/^https?:/.test(s)) ipcRenderer.send('img:prefetch', s);
  }, true);
  addEventListener('dragstart', async (e) => {
    const img = e.target;
    if (!ours(img) || e.defaultPrevented) return;
    e.preventDefault();
    const s = srcOf(img);
    let bytes = null;
    // Pictures made by the page itself (blob:, data:) are read here; web addresses are fetched by the browser.
    if (/^(blob|data):/.test(s)) { try { bytes = new Uint8Array(await (await fetch(s)).arrayBuffer()); } catch {} }
    ipcRenderer.send('img:drag', { src: s, bytes, name: (img.alt || '').slice(0, 60) });
  });
}
