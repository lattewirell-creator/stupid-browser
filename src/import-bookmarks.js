'use strict';
// Bookmark import: Chromium-based browsers on this computer (read their Bookmarks JSON), or any
// browser's exported bookmarks HTML file (Safari, Firefox, … all export the Netscape HTML format).
const { app, dialog, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

const home = os.homedir();
const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
const roaming = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
const mac = (p) => path.join(home, 'Library', 'Application Support', p);
const SOURCES = {
  darwin: [['chrome', 'Google Chrome', mac('Google/Chrome/Default/Bookmarks')], ['edge', 'Microsoft Edge', mac('Microsoft Edge/Default/Bookmarks')],
    ['brave', 'Brave', mac('BraveSoftware/Brave-Browser/Default/Bookmarks')], ['arc', 'Arc', mac('Arc/User Data/Default/Bookmarks')],
    ['vivaldi', 'Vivaldi', mac('Vivaldi/Default/Bookmarks')], ['opera', 'Opera', mac('com.operasoftware.Opera/Bookmarks')]],
  win32: [['chrome', 'Google Chrome', path.join(local, 'Google/Chrome/User Data/Default/Bookmarks')], ['edge', 'Microsoft Edge', path.join(local, 'Microsoft/Edge/User Data/Default/Bookmarks')],
    ['brave', 'Brave', path.join(local, 'BraveSoftware/Brave-Browser/User Data/Default/Bookmarks')], ['vivaldi', 'Vivaldi', path.join(local, 'Vivaldi/User Data/Default/Bookmarks')],
    ['opera', 'Opera', path.join(roaming, 'Opera Software/Opera Stable/Bookmarks')]],
  linux: [['chrome', 'Google Chrome', path.join(home, '.config/google-chrome/Default/Bookmarks')], ['chromium', 'Chromium', path.join(home, '.config/chromium/Default/Bookmarks')],
    ['brave', 'Brave', path.join(home, '.config/BraveSoftware/Brave-Browser/Default/Bookmarks')], ['edge', 'Microsoft Edge', path.join(home, '.config/microsoft-edge/Default/Bookmarks')]]
}[process.platform] || [];

// Tree node: { title, url } or { title, children: [...] }
function readChromium(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const conv = (n) => (n.type === 'folder' ? { title: n.name || 'Folder', children: (n.children || []).map(conv) } : { title: n.name || '', url: n.url || '' });
  const r = j.roots || {};
  return { bar: (r.bookmark_bar && r.bookmark_bar.children || []).map(conv), other: [...(r.other && r.other.children || []), ...(r.synced && r.synced.children || [])].map(conv) };
}
const count = (nodes) => nodes.reduce((n, x) => n + (x.children ? count(x.children) : (/^https?:/i.test(x.url) ? 1 : 0)), 0);
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

module.exports = function setupImport({ handle, store, getBookmarks, broadcast }) {
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

  handle('import:sources', ['internal'], () => SOURCES.filter(([, , f]) => fs.existsSync(f)).map(([id, name, f]) => {
    let n = 0; try { const t = readChromium(f); n = count(t.bar) + count(t.other); } catch {}
    return { id, name, count: n };
  }).filter((s) => s.count > 0));
  handle('import:browser', ['internal'], (_e, id) => {
    const src = SOURCES.find(([sid]) => sid === id);
    if (!src || !fs.existsSync(src[2])) return { ok: false, error: 'Couldn’t find that browser’s bookmarks.' };
    try { return addTree(readChromium(src[2]), src[1]); } catch { return { ok: false, error: 'Couldn’t read those bookmarks.' }; }
  });
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
};
module.exports.readHtml = readHtml;
