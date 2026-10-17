'use strict';
// Rewind: a private, searchable visual timeline of pages you've seen (main process).
// Opt-in. Stores a small JPEG + page text per visit in userData/rewind/, never for private windows,
// pages with password fields, sensitive-looking URLs or excluded sites. Keeps 30 days / 3,000 pages.
const { webContents } = require('electron');
const fs = require('fs');
const path = require('path');

const MAX_ITEMS = 3000, MAX_AGE = 30 * 864e5, SAME_PAGE_WINDOW = 10 * 60e3;
const SENSITIVE = /(^|\.)(bank|paypal|stripe|klarna|swish)\.|\/(login|log-in|signin|sign-in|signup|auth|oauth|checkout|billing|payment|pay|account\/security|password|2fa|mfa)(\/|$|\?)|bankid|netbank|internetbank/i;

async function captureArea(shellWc, rect, wc) {
  const r = rect && { x: Math.max(0, Math.round(rect.x)), y: Math.max(0, Math.round(rect.y)), width: Math.round(rect.width), height: Math.round(rect.height) };
  if (r && r.width > 40 && r.height > 40) return shellWc.capturePage(r);
  return wc.capturePage();
}
module.exports = Object.assign(function setupRewind({ app, handle, store, getSettings, entryFor, broadcast }) {
  const dir = () => path.join(app.getPath('userData'), 'rewind');
  const readIndex = () => store.read('rewind.json', []);
  const writeIndex = (list) => store.write('rewind.json', list, 1500);
  const enabled = () => !!getSettings().rewind;
  const excluded = (host) => (getSettings().rewindExclude || []).some((d) => host === d || host.endsWith('.' + d));

  function prune(list) {
    const cutoff = Date.now() - MAX_AGE;
    const keep = list.filter((x) => x.ts >= cutoff);
    while (keep.length > MAX_ITEMS) keep.shift();
    const alive = new Set(keep.map((x) => x.id));
    for (const x of list) if (!alive.has(x.id)) { try { fs.rmSync(path.join(dir(), x.id + '.jpg'), { force: true }); } catch {} }
    return keep;
  }

  // Called by the browser UI when a tab finished loading and is on screen.
  handle('rewind:capture', ['shell'], async (e, wcId, rect) => {
    if (!enabled()) return false;
    const wc = webContents.fromId(+wcId);
    if (!wc || wc.isDestroyed() || wc.getType() !== 'webview') return false;
    const owner = entryFor(wc), me = entryFor(e.sender);
    if (!owner || !me || owner.win.id !== me.win.id || owner.incognito) return false;
    let u; try { u = new URL(wc.getURL()); } catch { return false; }
    if (!/^https?:$/.test(u.protocol) || SENSITIVE.test(u.hostname + u.pathname) || excluded(u.hostname)) return false;
    let page;
    try {
      page = await wc.executeJavaScript(`(() => ({ pw: !!document.querySelector('input[type=password]'), text: (document.body ? document.body.innerText : '').replace(/\\s+/g, ' ').slice(0, 6000) }))()`, false);
    } catch { return false; }
    if (!page || page.pw) return false;
    const list = readIndex();
    const url = wc.getURL(), last = [...list].reverse().find((x) => x.url === url);
    if (last && Date.now() - last.ts < SAME_PAGE_WINDOW) return false;
    // Capture what the window shows where the tab is drawn (capturing the tab itself returns a blank image).
    let img;
    try { img = await captureArea(e.sender, rect, wc); } catch { return false; }
    if (!img || img.isEmpty()) return false;
    const { width } = img.getSize(); if (width > 640) img = img.resize({ width: 640, quality: 'good' });
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    fs.mkdirSync(dir(), { recursive: true });
    fs.writeFileSync(path.join(dir(), id + '.jpg'), img.toJPEG(62));
    list.push({ id, url, host: u.hostname.replace(/^www\./, ''), title: (wc.getTitle() || url).slice(0, 300), text: page.text, ts: Date.now() });
    writeIndex(prune(list));
    return true;
  });

  // Search: every word must appear (title, address or page text); newest first.
  handle('rewind:search', ['internal'], (_e, q, limit = 300) => {
    const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
    let list = readIndex().slice().reverse();
    if (words.length) {
      list = list.map((x) => {
        const hay = (x.title + ' ' + x.url + ' ' + x.text).toLowerCase();
        if (!words.every((w) => hay.includes(w))) return null;
        const score = words.reduce((s, w) => s + (x.title.toLowerCase().includes(w) ? 3 : 0) + (x.host.includes(w) ? 2 : 0) + 1, 0);
        const i = x.text.toLowerCase().indexOf(words[0]);
        const snippet = i >= 0 ? (i > 60 ? '…' : '') + x.text.slice(Math.max(0, i - 60), i + 140) + '…' : '';
        return Object.assign({}, x, { score, snippet });
      }).filter(Boolean).sort((a, b) => b.score - a.score || b.ts - a.ts);
    }
    return list.slice(0, Math.min(1000, limit)).map(({ text, ...rest }) => rest);
  });
  handle('rewind:status', ['internal', 'shell'], () => {
    const list = readIndex();
    let bytes = 0; try { for (const f of fs.readdirSync(dir())) bytes += fs.statSync(path.join(dir(), f)).size; } catch {}
    return { on: enabled(), count: list.length, bytes, exclude: getSettings().rewindExclude || [] };
  });
  handle('rewind:delete', ['internal'], (_e, ids) => {
    const set = new Set((ids || []).map(String));
    const list = readIndex();
    for (const x of list) if (set.has(x.id)) { try { fs.rmSync(path.join(dir(), x.id + '.jpg'), { force: true }); } catch {} }
    writeIndex(list.filter((x) => !set.has(x.id))); return true;
  });
  handle('rewind:clear', ['internal'], () => { store.write('rewind.json', []); try { fs.rmSync(dir(), { recursive: true, force: true }); } catch {} broadcast('rewind:changed', true); return true; });

  // Thumbnails are served to stupid://rewind/thumbs/<id>.jpg
  return function thumbResponse(rel) {
    const m = /^\/thumbs\/([a-z0-9]{6,20})\.jpg$/.exec(rel);
    if (!m) return null;
    const f = path.join(dir(), m[1] + '.jpg');
    if (!fs.existsSync(f)) return new Response('Not found', { status: 404 });
    return new Response(fs.readFileSync(f), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'max-age=86400' } });
  };
}, { captureArea });
