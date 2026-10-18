/* The Stupid Browser for Android: the page helpers (mac/js) talk to the app through __stupidTab, a message
 * channel Android adds to every frame. Replies (password suggestions, results) come back by id. */
(() => {
  const ch = window.__stupidTab;
  if (!ch || window.__stupidTabPost) return;
  let seq = 0; const waiting = new Map();
  ch.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } const w = waiting.get(m.id); if (w) { waiting.delete(m.id); w(m.value); } };
  Object.defineProperty(window, "__stupidTabPost", { value: (msg) => new Promise((resolve) => { const id = ++seq; waiting.set(id, resolve); ch.postMessage(JSON.stringify({ id, msg })); setTimeout(() => { if (waiting.delete(id)) resolve(null); }, 15000); }) });
})();
