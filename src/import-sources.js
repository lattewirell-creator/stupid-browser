'use strict';
// Finds other browsers' profiles on this computer and reads their bookmarks and history.
// Chromium family (Chrome, Edge, Brave, Arc, Vivaldi, Opera, Chromium): every profile, with the Google/Microsoft
// account it's signed in to (from "Local State"). Firefox family (Firefox, Zen, LibreWolf): every profile from
// profiles.ini, with its Mozilla account (signedInUser.json). Safari on macOS (needs Full Disk Access).
// Nothing here writes to the other browser: databases are copied to a temp folder before they're opened.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const home = os.homedir();
const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
const roaming = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
const mac = (p) => path.join(home, 'Library', 'Application Support', p);
const lin = (p) => path.join(home, p);
let tempDir = os.tmpdir();

// [id, name, user data folder]
const CHROMIUM = {
  darwin: [['chrome', 'Google Chrome', mac('Google/Chrome')], ['edge', 'Microsoft Edge', mac('Microsoft Edge')],
    ['brave', 'Brave', mac('BraveSoftware/Brave-Browser')], ['arc', 'Arc', mac('Arc/User Data')], ['vivaldi', 'Vivaldi', mac('Vivaldi')],
    ['opera', 'Opera', mac('com.operasoftware.Opera')], ['operagx', 'Opera GX', mac('com.operasoftware.OperaGX')], ['chromium', 'Chromium', mac('Chromium')]],
  win32: [['chrome', 'Google Chrome', path.join(local, 'Google/Chrome/User Data')], ['edge', 'Microsoft Edge', path.join(local, 'Microsoft/Edge/User Data')],
    ['brave', 'Brave', path.join(local, 'BraveSoftware/Brave-Browser/User Data')], ['vivaldi', 'Vivaldi', path.join(local, 'Vivaldi/User Data')],
    ['opera', 'Opera', path.join(roaming, 'Opera Software/Opera Stable')], ['operagx', 'Opera GX', path.join(roaming, 'Opera Software/Opera GX Stable')],
    ['arc', 'Arc', path.join(local, 'Packages/TheBrowserCompany.Arc_ttt1ap7aakyb4/LocalCache/Local/Arc/User Data')], ['chromium', 'Chromium', path.join(local, 'Chromium/User Data')]],
  linux: [['chrome', 'Google Chrome', lin('.config/google-chrome')], ['chromium', 'Chromium', lin('.config/chromium')],
    ['brave', 'Brave', lin('.config/BraveSoftware/Brave-Browser')], ['edge', 'Microsoft Edge', lin('.config/microsoft-edge')],
    ['vivaldi', 'Vivaldi', lin('.config/vivaldi')], ['opera', 'Opera', lin('.config/opera')]]
}[process.platform] || [];
// [id, name, folder holding profiles.ini]
const GECKO = {
  darwin: [['firefox', 'Firefox', mac('Firefox')], ['zen', 'Zen', mac('zen')], ['librewolf', 'LibreWolf', mac('librewolf')]],
  win32: [['firefox', 'Firefox', path.join(roaming, 'Mozilla/Firefox')], ['zen', 'Zen', path.join(roaming, 'zen')], ['librewolf', 'LibreWolf', path.join(roaming, 'librewolf')]],
  linux: [['firefox', 'Firefox', lin('.mozilla/firefox')], ['zen', 'Zen', lin('.zen')], ['librewolf', 'LibreWolf', lin('.librewolf')]]
}[process.platform] || [];
const SAFARI = path.join(home, 'Library', 'Safari');

const isFile = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } };
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const count = (nodes) => nodes.reduce((n, x) => n + (x.children ? count(x.children) : (/^https?:/i.test(x.url) ? 1 : 0)), 0);
const okTs = (ts) => ts > 0 && ts <= Date.now() + 864e5;
const histRow = (url, title, ts) => ({ url: String(url).slice(0, 4000), title: String(title || url).slice(0, 300), ts: Math.round(ts) });

// Open a copy of an SQLite database (the browser may have it open and locked). WAL files come along so
// recent changes that haven't been folded into the main file yet are included.
function withCopy(file, fn) {
  const dir = fs.mkdtempSync(path.join(tempDir, 'stupid-import-'));
  let db;
  try {
    const dst = path.join(dir, 'db.sqlite');
    fs.copyFileSync(file, dst);
    for (const ext of ['-wal', '-journal']) if (isFile(file + ext)) fs.copyFileSync(file + ext, dst + ext);
    const { DatabaseSync } = require('node:sqlite');
    db = new DatabaseSync(dst);
    return fn(db);
  } finally {
    try { if (db) db.close(); } catch {}
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

/* ---------- Chromium ---------- */
// Tree node: { title, url } or { title, children: [...] }
function readChromium(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const conv = (n) => (n.type === 'folder' ? { title: n.name || 'Folder', children: (n.children || []).map(conv) } : { title: n.name || '', url: n.url || '' });
  const r = j.roots || {};
  return { bar: (r.bookmark_bar && r.bookmark_bar.children || []).map(conv), other: [...(r.other && r.other.children || []), ...(r.synced && r.synced.children || [])].map(conv) };
}
// History lives next to Bookmarks.
function readChromiumHistory(profileDir, limit = 5000) {
  const src = path.join(profileDir, 'History');
  if (!isFile(src)) return [];
  try {
    return withCopy(src, (db) => db.prepare('SELECT url, title, last_visit_time / 1000 AS t FROM urls WHERE hidden = 0 AND url LIKE \'http%\' ORDER BY last_visit_time DESC LIMIT ?').all(limit))
      // WebKit time is microseconds since 1601 (too big for JS numbers), so SQL turns it into ms first
      .map((r) => histRow(r.url, r.title, Number(r.t) - 11644473600000)).filter((r) => okTs(r.ts));
  } catch (e) { console.error('history import failed', e.message); return []; }
}
function chromiumProfiles([bid, bname, root]) {
  const out = [];
  // Opera keeps a single profile right in its folder.
  if (isFile(path.join(root, 'Bookmarks')) || isFile(path.join(root, 'History'))) out.push({ dir: root, key: '.', profile: '', account: '' });
  const info = ((readJson(path.join(root, 'Local State')) || {}).profile || {}).info_cache || {};
  let dirs = Object.keys(info);
  if (!dirs.length) { try { dirs = fs.readdirSync(root).filter((d) => d === 'Default' || /^Profile \d+$/.test(d)); } catch {} }
  for (const d of dirs) {
    const dir = path.join(root, d);
    if (!isFile(path.join(dir, 'Bookmarks')) && !isFile(path.join(dir, 'History'))) continue;
    const i = info[d] || {};
    out.push({ dir, key: d, profile: String(i.name || (d === 'Default' ? '' : d)), account: String(i.user_name || '') });
  }
  return out.map((p) => ({ ...p, id: `${bid}:${p.key}`, kind: 'chromium', browser: bid, name: bname, multi: out.length > 1 }));
}

/* ---------- Firefox ---------- */
function geckoProfiles([bid, bname, root]) {
  let ini; try { ini = fs.readFileSync(path.join(root, 'profiles.ini'), 'utf8'); } catch { return []; }
  const out = []; let cur = null;
  for (const line of ini.split(/\r?\n/)) {
    const sec = line.match(/^\[(.+)\]\s*$/);
    if (sec) { cur = /^Profile\d+$/.test(sec[1]) ? {} : null; if (cur) out.push(cur); continue; }
    const kv = line.match(/^([^=]+)=(.*)$/);
    if (cur && kv) cur[kv[1].trim()] = kv[2].trim();
  }
  return out.filter((p) => p.Path).map((p) => {
    const dir = p.IsRelative === '0' ? p.Path : path.join(root, p.Path);
    const user = (readJson(path.join(dir, 'signedInUser.json')) || {}).accountData || {};
    return { dir, key: p.Path, id: `${bid}:${p.Path}`, kind: 'gecko', browser: bid, name: bname, profile: String(p.Name || ''), account: String(user.email || '') };
  }).filter((p) => isFile(path.join(p.dir, 'places.sqlite'))).map((p, _i, all) => ({ ...p, multi: all.length > 1 }));
}
function readGecko(profileDir) {
  return withCopy(path.join(profileDir, 'places.sqlite'), (db) => {
    const rows = db.prepare('SELECT b.id, b.type, b.parent, b.title, b.guid, p.url FROM moz_bookmarks b LEFT JOIN moz_places p ON p.id = b.fk ORDER BY b.parent, b.position').all();
    const kids = new Map();
    for (const r of rows) { if (!kids.has(r.parent)) kids.set(r.parent, []); kids.get(r.parent).push(r); }
    const conv = (r) => (r.type === 2 ? { title: r.title || 'Folder', children: (kids.get(r.id) || []).map(conv).filter(Boolean) }
      : r.type === 1 ? { title: r.title || '', url: r.url || '' } : null);
    const root = (guid) => { const r = rows.find((x) => x.guid === guid); return r ? (kids.get(r.id) || []).map(conv).filter(Boolean) : []; };
    return { bar: root('toolbar_____'), other: [...root('unfiled_____'), { title: 'Bookmarks Menu', children: root('menu________') }, { title: 'Mobile bookmarks', children: root('mobile______') }] };
  });
}
function readGeckoHistory(profileDir, limit = 5000) {
  try {
    return withCopy(path.join(profileDir, 'places.sqlite'), (db) => db.prepare('SELECT url, title, last_visit_date / 1000 AS t FROM moz_places WHERE hidden = 0 AND last_visit_date IS NOT NULL AND url LIKE \'http%\' ORDER BY last_visit_date DESC LIMIT ?').all(limit))
      .map((r) => histRow(r.url, r.title, Number(r.t))).filter((r) => okTs(r.ts));
  } catch (e) { console.error('history import failed', e.message); return []; }
}

/* ---------- Safari ---------- */
// Bookmarks.plist is binary; plutil turns it into XML, which this reads (dict/array/string/key are all we need).
function parsePlistXml(xml) {
  const re = /<(\/?)(dict|array|key|string|integer|real|date|data|true|false)\s*(\/?)>([^<]*)/g;
  const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  const stack = []; let key = null, top;
  const put = (v) => { const p = stack[stack.length - 1]; if (!p) { top = v; return; } if (Array.isArray(p)) p.push(v); else { p[key] = v; key = null; } };
  let m;
  while ((m = re.exec(xml))) {
    const [, close, tag, self, text] = m;
    if (tag === 'dict' || tag === 'array') {
      if (close) { const v = stack.pop(); if (!stack.length) top = v; }
      else if (self) put(tag === 'dict' ? {} : []);
      else { const v = tag === 'dict' ? {} : []; put(v); stack.push(v); }
    } else if (close) continue;
    else if (tag === 'key') key = unesc(text);
    else if (tag === 'true' || tag === 'false') put(tag === 'true');
    else if (tag === 'string') put(unesc(text));
    else put(self ? '' : text);
  }
  return top;
}
function readSafari() {
  const xml = execFileSync('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', path.join(SAFARI, 'Bookmarks.plist')], { maxBuffer: 100e6 }).toString('utf8');
  const conv = (n) => (n.WebBookmarkType === 'WebBookmarkTypeList' ? { title: n.Title || 'Folder', children: (n.Children || []).map(conv).filter(Boolean) }
    : n.WebBookmarkType === 'WebBookmarkTypeLeaf' ? { title: (n.URIDictionary && n.URIDictionary.title) || '', url: n.URLString || '' } : null);
  const top = ((parsePlistXml(xml) || {}).Children || []).filter((n) => n.WebBookmarkType === 'WebBookmarkTypeList');
  const bar = top.find((n) => n.Title === 'BookmarksBar'), menu = top.find((n) => n.Title === 'BookmarksMenu'), reading = top.find((n) => n.Title === 'com.apple.ReadingList');
  const rest = top.filter((n) => n !== bar && n !== menu && n !== reading).map(conv);
  return { bar: bar ? conv(bar).children : [], other: [...(menu ? conv(menu).children : []), ...rest, ...(reading ? [{ title: 'Reading List', children: conv(reading).children }] : [])] };
}
function readSafariHistory(limit = 5000) {
  try {
    return withCopy(path.join(SAFARI, 'History.db'), (db) => db.prepare('SELECT i.url AS url, v.title AS title, MAX(v.visit_time) AS t FROM history_items i JOIN history_visits v ON v.history_item = i.id WHERE i.url LIKE \'http%\' GROUP BY i.id ORDER BY t DESC LIMIT ?').all(limit))
      // Safari counts seconds since 2001-01-01
      .map((r) => histRow(r.url, r.title, (Number(r.t) + 978307200) * 1000)).filter((r) => okTs(r.ts));
  } catch (e) { console.error('safari history import failed', e.message); return []; }
}
// macOS hides Safari's files from other apps until the user grants Full Disk Access.
function safariAccess() {
  try { fs.closeSync(fs.openSync(path.join(SAFARI, 'Bookmarks.plist'), 'r')); return true; } catch (e) { return e.code === 'ENOENT' ? null : false; }
}

/* ---------- discovery ---------- */
function discover() {
  const list = [...CHROMIUM.flatMap(chromiumProfiles), ...GECKO.flatMap(geckoProfiles)];
  if (process.platform === 'darwin' && fs.existsSync(SAFARI)) {
    const access = safariAccess();
    if (access !== null) list.push({ id: 'safari', kind: 'safari', browser: 'safari', name: 'Safari', profile: '', account: '', dir: SAFARI, needsAccess: !access });
  }
  return list;
}
function readBookmarks(src) {
  if (src.kind === 'chromium') return isFile(path.join(src.dir, 'Bookmarks')) ? readChromium(path.join(src.dir, 'Bookmarks')) : { bar: [], other: [] };
  if (src.kind === 'gecko') return readGecko(src.dir);
  return readSafari();
}
function readHistory(src) {
  if (src.kind === 'chromium') return readChromiumHistory(src.dir);
  if (src.kind === 'gecko') return readGeckoHistory(src.dir);
  return readSafariHistory();
}
const hasHistory = (src) => isFile(path.join(src.dir, src.kind === 'chromium' ? 'History' : src.kind === 'gecko' ? 'places.sqlite' : 'History.db'));
// What the import screens show: no folder paths leave the main process.
function summary(src) {
  let n = 0;
  if (!src.needsAccess) { try { const t = readBookmarks(src); n = count(t.bar) + count(t.other); } catch {} }
  return { id: src.id, browser: src.browser, name: src.name, profile: src.multi ? src.profile : '', account: src.account, count: n, history: !src.needsAccess && hasHistory(src), needsAccess: !!src.needsAccess };
}
// Folder name for imported bookmarks, e.g. "Imported from Google Chrome (nils@example.com)".
const labelOf = (src) => src.name + ((src.account || (src.multi && src.profile)) ? ` (${src.account || src.profile})` : '');

module.exports = { discover, summary, readBookmarks, readHistory, labelOf, count, readChromium, readChromiumHistory, parsePlistXml, setTempDir: (d) => { tempDir = d; } };
