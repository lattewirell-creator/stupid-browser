'use strict';
// Bookmark + history import from other browsers' profiles on this computer (see import-sources.js), or any
// browser's exported bookmarks HTML file (the Netscape HTML format every browser can export).
const { app, dialog, BrowserWindow, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const src = require('./import-sources');
const decodeEntities = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
// Netscape bookmark HTML: <DT><H3>Folder</H3><DL><p> … <DT><A HREF="…">Title</A> … </DL>
function readHtml(text) {
  const root = { children: [] }; const stack = [root]; let pendingFolder = null;
  const re = /<DT><H3[^>]*>([\s\S]*?)<\/H3>|<DT><A\s[^>]*HREF="([^"]*)"[^>]*>([\s\S]*?)<\/A>|<DL>|<\/DL>/gi;
  let m;
  while ((m = re.exec(text))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) { pendingFolder = { title: decodeEntities(m[1].trim()) || 'Folder', children: [] }; top.children.push(pendingFolder); }
    else if (m[2] !== undefined) top.children.push({ title: decodeEntities(m[3].replace(/<[^>]*>/g, '').trim()), url: decodeEntities(m[2]) });
    else if (/^<DL>$/i.test(m[0])) { if (pendingFolder) { stack.push(pendingFolder); pendingFolder = null; } }
    else if (stack.length > 1) stack.pop();
  }
  // Safari/Firefox exports wrap everything in a "Bookmarks Bar"/"Bookmarks Toolbar" folder: treat it as the bar.
  const barIdx = root.children.findIndex((n) => n.children && /bookmarks (bar|toolbar)|favorites bar|favourites/i.test(n.title));
  const bar = barIdx >= 0 ? root.children.splice(barIdx, 1)[0].children : [];
  return { bar, other: root.children };
}

// CSV exported by Chrome/Edge (name,url,username,password), Safari (Title,URL,Username,Password,…) or Firefox (url,username,password,…)
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}

module.exports = function setupImport({ handle, store, getBookmarks, broadcast, getHistory, getPasswords, enc }) {
  function addHistoryRows(rows) {
    if (!rows.length) return 0;
    const h = getHistory().slice();
    const seen = new Set(h.map((x) => x.url + '|' + Math.round(x.ts / 60000)));
    let n = 0;
    for (const r of rows) {
      const k = r.url + '|' + Math.round(r.ts / 60000); if (seen.has(k)) continue; seen.add(k);
      h.push({ id: r.ts.toString(36) + Math.random().toString(36).slice(2, 6), url: r.url, title: r.title, ts: r.ts }); n++;
    }
    h.sort((a, b) => a.ts - b.ts); if (h.length > 20000) h.splice(0, h.length - 20000);
    store.write('history.json', h); return n;
  }
  function addTree(tree, label) {
    const all = getBookmarks().slice();
    const known = new Set(all.filter((b) => b.type === 'bookmark').map((b) => b.url));
    const fresh = !all.length;
    let seq = 0, added = 0;
    const id = () => 'i' + Date.now().toString(36) + (seq++).toString(36);
    const put = (nodes, parentId) => {
      for (const n of nodes) {
        if (all.length > 20000) return;
        if (n.children) {
          const f = { id: id(), type: 'folder', title: String(n.title).slice(0, 200), parentId, ts: Date.now() };
          all.push(f); put(n.children, f.id);
          if (!all.some((b) => b.parentId === f.id)) all.splice(all.indexOf(f), 1);   // drop empty folders
        } else if (/^https?:\/\//i.test(n.url) && !known.has(n.url)) {
          known.add(n.url); added++;
          all.push({ id: id(), type: 'bookmark', title: String(n.title || n.url).slice(0, 300), url: n.url.slice(0, 4000), favicon: null, parentId, ts: Date.now() });
        }
      }
    };
    // New users get the other browser's bar as their bar; otherwise it goes into its own folder.
    let barParent = null, otherParent;
    if (!fresh) { const f = { id: id(), type: 'folder', title: `Imported from ${label}`, parentId: null, ts: Date.now() }; all.push(f); barParent = f.id; }
    put(tree.bar, barParent);
    if (tree.other.length) { const f = { id: id(), type: 'folder', title: fresh ? 'Other bookmarks' : 'Other bookmarks', parentId: barParent, ts: Date.now() }; all.push(f); otherParent = f.id; put(tree.other, otherParent); if (!all.some((b) => b.parentId === f.id)) all.splice(all.indexOf(f), 1); }
    if (!fresh && !all.some((b) => b.parentId === barParent)) all.splice(all.findIndex((b) => b.id === barParent), 1);
    store.write('bookmarks.json', all); broadcast('bookmarks:changed', all);
    return { ok: true, added };
  }

  src.setTempDir(app.getPath('temp'));
  handle('import:sources', ['internal'], () => src.discover().map(src.summary).filter((s) => s.needsAccess || s.count > 0 || s.history));
  // what: { bookmarks, history } (both by default). The id is looked up again here, so pages never pass paths.
  handle('import:browser', ['internal'], (_e, id, what) => {
    const s = src.discover().find((x) => x.id === id);
    if (!s) return { ok: false, error: 'Couldn’t find that browser on this computer any more.' };
    if (s.needsAccess) return { ok: false, error: 'macOS hasn’t given The Stupid Browser access to Safari yet.' };
    const want = { bookmarks: true, history: true, ...(what && typeof what === 'object' ? what : {}) };
    let res = { ok: true, added: 0 };
    if (want.bookmarks) {
      try { res = addTree(src.readBookmarks(s), src.labelOf(s)); } catch (e) { console.error('bookmark import failed', e.message); return { ok: false, error: 'Couldn’t read those bookmarks. If that browser is open, quit it and try again.' }; }
    }
    res.history = want.history ? addHistoryRows(src.readHistory(s)) : 0;
    return res;
  });
  // Safari: open System Settings → Privacy & Security → Full Disk Access.
  handle('import:safariAccess', ['internal'], () => shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles').then(() => true, () => false));
  handle('import:file', ['internal'], async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender.hostWebContents || e.sender);
    const r = await dialog.showOpenDialog(win, { title: 'Import bookmarks', buttonLabel: 'Import', properties: ['openFile'], filters: [{ name: 'Bookmarks file', extensions: ['html', 'htm'] }], defaultPath: app.getPath('downloads') });
    if (r.canceled || !r.filePaths[0]) return { ok: false, error: 'canceled' };
    try {
      const text = fs.readFileSync(r.filePaths[0], 'utf8');
      if (text.length > 50e6 || !/<DL>/i.test(text)) return { ok: false, error: 'That isn’t a bookmarks file.' };
      return addTree(readHtml(text), path.basename(r.filePaths[0]).replace(/\.html?$/i, ''));
    } catch { return { ok: false, error: 'Couldn’t read that file.' }; }
  });
  // Passwords from a browser's CSV export; encrypted immediately like any saved password.
  handle('import:passwords', ['internal'], async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender.hostWebContents || e.sender);
    const r = await dialog.showOpenDialog(win, { title: 'Import passwords', buttonLabel: 'Import', properties: ['openFile'], filters: [{ name: 'Passwords file', extensions: ['csv'] }], defaultPath: app.getPath('downloads') });
    if (r.canceled || !r.filePaths[0]) return { ok: false, error: 'canceled' };
    let rows;
    try { const text = fs.readFileSync(r.filePaths[0], 'utf8'); if (text.length > 20e6) throw new Error('big'); rows = parseCsv(text.replace(/^\uFEFF/, '')); } catch { return { ok: false, error: 'Couldn’t read that file.' }; }
    const head = (rows.shift() || []).map((x) => x.trim().toLowerCase());
    const col = (...names) => head.findIndex((h) => names.includes(h));
    const iu = col('url', 'website', 'login_uri', 'origin'), iuser = col('username', 'login', 'login_username', 'user name'), ipw = col('password', 'login_password');
    if (iu < 0 || ipw < 0) return { ok: false, error: 'That doesn’t look like a passwords export (it needs url and password columns).' };
    const list = getPasswords().slice();
    let added = 0, skipped = 0;
    for (const row of rows) {
      let origin; try { const u = new URL((row[iu] || '').trim()); if (!/^https?:$/.test(u.protocol)) throw 0; origin = u.origin; } catch { skipped++; continue; }
      const username = String(iuser >= 0 ? row[iuser] || '' : '').slice(0, 300), password = String(row[ipw] || '').slice(0, 1000);
      if (!password) { skipped++; continue; }
      if (list.some((p) => p.origin === origin && !p.never && p.username === username)) { skipped++; continue; }
      list.push({ id: 'p' + Date.now().toString(36) + added.toString(36), origin, username, password: enc(password), created: Date.now() }); added++;
    }
    store.write('passwords.json', list); broadcast('passwords:changed', true);
    return { ok: true, added, skipped, file: path.basename(r.filePaths[0]) };
  });
};
module.exports.readHtml = readHtml;
module.exports.parseCsv = parseCsv;
