'use strict';
// Runs in web pages (isolated world). Dragging a picture takes the picture itself along as a real file, so you can
// drop it in a chat or an upload box in another tab, on the desktop or in another app (Chromium alone only carries
// its address). The file is fetched as you press on the picture, so the drag starts at once. Pages that make their
// own pictures draggable (galleries you sort, editors) keep their own behaviour.
const { ipcRenderer } = require('electron');
// You typed in a field (a real key press, not a value the page set): it's marked, so a tab with your half-written
// text is never put to sleep (renderer.js sleepTab). Every page, internal ones too.
addEventListener('input', (e) => { if (e.isTrusted && e.target && e.target.dataset) e.target.dataset.sbTyped = '1'; }, true);
// Mouse gestures (Windows): hold the right button and draw. ← back, → forward, ↓ new tab, ↓→ close tab, ↑↓ reload,
// ↑→ / ↑← next / previous space. A short right-click is still a right-click; a gesture never opens the menu. On macOS
// and Linux the menu opens as the button goes down, so gestures can't work there and stay off.
if (process.platform === 'win32') {
  let g = null, gestOn = null, swallow = false;
  ipcRenderer.invoke('gesture:on').then((v) => { gestOn = !!v; }).catch(() => { gestOn = false; });
  const MOVES = { L: 'back', R: 'forward', D: 'new-tab', DR: 'close-tab', UD: 'reload', UR: 'space-next', UL: 'space-prev' };
  const trail = () => {
    const svgNS = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(svgNS, 'svg');
    s.setAttribute('style', 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483647');
    const p = document.createElementNS(svgNS, 'polyline');
    p.setAttribute('style', 'fill:none;stroke:#D97757;stroke-width:4;stroke-linecap:round;stroke-linejoin:round;opacity:.75');
    s.appendChild(p); (document.body || document.documentElement).appendChild(s);
    return { s, p };
  };
  addEventListener('mousedown', (e) => {
    if (e.button !== 2 || !e.isTrusted || !gestOn) { g = null; return; }
    g = { x: e.clientX, y: e.clientY, pts: [[e.clientX, e.clientY]], dirs: '', lx: e.clientX, ly: e.clientY, t: null };
  }, true);
  addEventListener('mousemove', (e) => {
    if (!g || !(e.buttons & 2)) return;
    g.pts.push([e.clientX, e.clientY]);
    const dx = e.clientX - g.lx, dy = e.clientY - g.ly;
    if (Math.abs(dx) < 30 && Math.abs(dy) < 30) { if (g.t) g.t.p.setAttribute('points', g.pts.map((p) => p.join(',')).join(' ')); return; }
    const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U');
    if (g.dirs[g.dirs.length - 1] !== d) g.dirs += d;
    g.lx = e.clientX; g.ly = e.clientY;
    if (!g.t) g.t = trail();
    g.t.p.setAttribute('points', g.pts.map((p) => p.join(',')).join(' '));
  }, true);
  addEventListener('mouseup', (e) => {
    if (!g || e.button !== 2) return;
    const done = g; g = null;
    if (done.t) done.t.s.remove();
    if (!done.dirs) return;          // just a right-click: the menu opens as usual
    swallow = true;                  // a gesture: no menu
    const cmd = MOVES[done.dirs];
    if (cmd) ipcRenderer.send('gesture', cmd);
  }, true);
  addEventListener('contextmenu', (e) => { if (swallow) { swallow = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
}

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
