'use strict';
const {
  app, BrowserWindow, ipcMain, session, shell, webContents, nativeTheme, protocol, net,
  Menu, clipboard, dialog, safeStorage, nativeImage
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
const store = require('./store');

const IS_MAC = process.platform === 'darwin';
app.setName('The Stupid Browser');
const profiles = require('./profiles');   // picks this profile's data folder; must come before any userData use
if (process.platform === 'win32') app.setAppUserModelId('com.emil.stupidbrowser');

// Plain Chrome user agent so sites (Google, AI chats) treat us like a normal browser.
const UA_OS = IS_MAC ? 'Macintosh; Intel Mac OS X 10_15_7' : 'Windows NT 10.0; Win64; x64';
const UA = `Mozilla/5.0 (${UA_OS}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;
app.userAgentFallback = UA;

protocol.registerSchemesAsPrivileged([
  { scheme: 'stupid', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false } }
]);

/* =========================================================================
   Defaults and data
   ========================================================================= */
const DEFAULT_BOTS = [
  { name: 'Claude', url: 'https://claude.ai' },
  { name: 'Grok', url: 'https://grok.com' },
  { name: 'ChatGPT', url: 'https://chatgpt.com' },
  { name: 'Gemini', url: 'https://gemini.google.com' },
  { name: 'Perplexity', url: 'https://www.perplexity.ai' }
];
const SEARCH_ENGINES = {
  google: { name: 'Google', url: 'https://www.google.com/search?q=%s' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=%s' },
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  ecosia: { name: 'Ecosia', url: 'https://www.ecosia.org/search?q=%s' },
  brave: { name: 'Brave Search', url: 'https://search.brave.com/search?q=%s' },
  startpage: { name: 'Startpage', url: 'https://www.startpage.com/do/search?q=%s' },
  qwant: { name: 'Qwant', url: 'https://www.qwant.com/?q=%s' },
  kagi: { name: 'Kagi', url: 'https://kagi.com/search?q=%s' },
  mojeek: { name: 'Mojeek', url: 'https://www.mojeek.com/search?q=%s' },
  perplexity: { name: 'Perplexity (AI)', url: 'https://www.perplexity.ai/search?q=%s' },
  yahoo: { name: 'Yahoo', url: 'https://search.yahoo.com/search?p=%s' },
  yandex: { name: 'Yandex', url: 'https://yandex.com/search/?text=%s' },
  wikipedia: { name: 'Wikipedia', url: 'https://en.wikipedia.org/w/index.php?search=%s' },
  youtube: { name: 'YouTube', url: 'https://www.youtube.com/results?search_query=%s' }
};
const DEFAULT_SETTINGS = () => ({
  name: '', email: '', profileColor: 'clay', mail: 'gmail', mailUrl: '',
  logo: 'ring', logoEmoji: '🦆', logoImage: '', wordmark: '', showQuotes: true, quoteMode: 'browser', myQuotes: [],
  eq: { on: false, preset: 'flat', gains: [0, 0, 0, 0, 0, 0, 0, 0] },
  aiButton: 'buddy', buddy: { enabled: true, provider: 'anthropic', models: { anthropic: 'claude-opus-5-5' }, bases: {}, look: true },
  bg: 'none', bgDim: 25, tabSleep: 15, uiFont: 'inter', density: 'comfortable', corners: 'rounded', tabStyle: 'classic', frameTint: 'soft', hideButtons: [], brandBundle: false, rewind: false, rewindExclude: [], modernLook: true, verticalTabs: false, compactMode: false, appIcon: false, appIconImage: '', buddyLook: { name: 'Buddy', color: 'cream', glow: 'cyan', extra: 'none', image: '' },
  theme: 'system', accent: 'clay', fontSize: 'medium', showBookmarksBar: true, showHome: true, musicIsland: true,
  startup: 'continue', startupPages: [],
  search: 'duckduckgo', customSearch: '',
  adblock: true, dnt: false, savePasswords: true,
  downloadDir: app.getPath('downloads'), askWhereToSave: false,
  defaultBot: 'https://claude.ai', bot: null, aiWidth: 420,
  pinned: []
});
const DEFAULT_SIDEBAR = [
  { id: 'claude', name: 'Claude', url: 'https://claude.ai', ai: true },
  { id: 'whatsapp', name: 'WhatsApp', url: 'https://web.whatsapp.com' },
  { id: 'discord', name: 'Discord', url: 'https://discord.com/app' },
  { id: 'instagram', name: 'Instagram', url: 'https://www.instagram.com' },
  { id: 'spotify', name: 'Spotify', url: 'https://open.spotify.com' },
  { id: 'ytmusic', name: 'YouTube Music', url: 'https://music.youtube.com' },
  { id: 'twitch', name: 'Twitch', url: 'https://www.twitch.tv' }
];
// App grid (9-dot launcher). 'mail' opens whichever mail service the profile picked.
const DEFAULT_LAUNCHER = [
  { id: 'mail', name: 'Mail', url: 'mail' },
  { id: 'search', name: 'Search', url: 'https://duckduckgo.com' },
  { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com' },
  { id: 'maps', name: 'Maps', url: 'https://maps.google.com' },
  { id: 'drive', name: 'Drive', url: 'https://drive.google.com' },
  { id: 'docs', name: 'Docs', url: 'https://docs.google.com/document' },
  { id: 'sheets', name: 'Sheets', url: 'https://docs.google.com/spreadsheets' },
  { id: 'calendar', name: 'Calendar', url: 'https://calendar.google.com' },
  { id: 'photos', name: 'Photos', url: 'https://photos.google.com' },
  { id: 'translate', name: 'Translate', url: 'https://translate.google.com' },
  { id: 'news', name: 'News', url: 'https://news.google.com' },
  { id: 'claude', name: 'Claude', url: 'https://claude.ai' }
];
const INTERNAL_PAGES = ['newtab', 'settings', 'history', 'downloads', 'bookmarks', 'source', 'welcome', 'rewind'];
const PERM_KINDS = ['camera', 'microphone', 'location', 'notifications'];
const FONT_SIZES = { small: 14, medium: 16, large: 19, xlarge: 22 };

const getSettings = () => Object.assign(DEFAULT_SETTINGS(), store.read('settings.json', {}));
function setSettings(patch) {
  const prev = getSettings();
  const next = Object.assign(prev, patch);
  store.write('settings.json', next);
  applySettingsSideEffects(patch);
  broadcast('settings:changed', publicSettings());
  if ('name' in patch || 'profileColor' in patch || 'email' in patch) profiles.sync(next);
  return next;
}
function publicSettings() {
  const s = getSettings();
  return Object.assign({}, s, { searchUrl: searchUrlFor(s), engines: SEARCH_ENGINES });
}
function searchUrlFor(s) {
  if (s.search === 'custom' && /%s/.test(s.customSearch || '') && /^https?:\/\//.test(s.customSearch)) return s.customSearch;
  return (SEARCH_ENGINES[s.search] || SEARCH_ENGINES.google).url;
}

function getBookmarks() {
  let b = store.read('bookmarks.json', []);
  // v1 stored a flat list of {title,url,favicon}; migrate to nodes with ids.
  if (b.length && !b[0].id) {
    b = b.map((x, i) => ({ id: 'b' + Date.now().toString(36) + i, type: 'bookmark', title: x.title, url: x.url, favicon: x.favicon || null, parentId: null, ts: Date.now() }));
    store.write('bookmarks.json', b);
  }
  return b;
}
const getBots = () => store.read('ai-bots.json', DEFAULT_BOTS);
const getHistory = () => store.read('history.json', []);
const getSitePerms = () => store.read('site-permissions.json', {});
const getPasswords = () => store.read('passwords.json', []);

/* =========================================================================
   Windows, sessions, partitions
   ========================================================================= */
const PERSIST = 'persist:stupid';
const PERSIST_AI = 'persist:stupid-ai';
const PERSIST_APPS = 'persist:stupid-apps';
const windows = new Map();     // BrowserWindow.id -> { win, incognito, partition, aiPartition }
const sessions = new Map();    // BrowserWindow.id -> { tabs, active }  (persistent windows only)
let quitting = false;
let incognitoCounter = 0;
const preparedSessions = new WeakSet();

function themeColors(incognito) {
  if (incognito) return { bg: '#1B1A19', bar: '#232120', fg: '#ECE9E1' };
  return nativeTheme.shouldUseDarkColors
    ? { bg: '#1F1E1D', bar: '#262624', fg: '#ECE9E1' }
    : { bg: '#FAF9F5', bar: '#F0EEE6', fg: '#3D3929' };
}

// Windows fade in/out instead of popping (smooth profile switches, new windows).
function fadeWin(win, to, ms = 180, done) {
  if (!win || win.isDestroyed() || process.env.STUPID_SELFTEST) { if (to > 0 && win && !win.isDestroyed()) { win.setOpacity(1); } if (done) done(); return; }
  const from = win.getOpacity(), t0 = Date.now();
  const step = () => {
    if (win.isDestroyed()) return;
    const k = Math.min(1, (Date.now() - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    win.setOpacity(from + (to - from) * e);
    if (k < 1) setTimeout(step, 12); else if (done) done();
  };
  step();
}
function showSmooth(win) { if (win.isDestroyed()) return; win.setOpacity(0); win.show(); fadeWin(win, 1); }
const windowTitle = (incognito) => { const n = (getSettings().wordmark || '').trim() || 'The Stupid Browser'; return incognito ? `Private — ${n}` : n; };
function createWindow({ incognito = false, restore = null, urls = null } = {}) {
  const partition = incognito ? `incognito-${++incognitoCounter}` : PERSIST;   // no "persist:" = in memory only
  const aiPartition = incognito ? `${partition}-ai` : PERSIST_AI;
  const appsPartition = incognito ? `${partition}-apps` : PERSIST_APPS;
  prepareSession(session.fromPartition(partition), { tabs: true, incognito });
  prepareSession(session.fromPartition(aiPartition), { tabs: false, incognito });
  prepareSession(session.fromPartition(appsPartition), { tabs: false, incognito });
  const c = themeColors(incognito);
  const win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 720, minHeight: 480,
    title: windowTitle(incognito),
    backgroundColor: c.bg,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    // Windows: custom-drawn caption buttons on the right. macOS: traffic lights inset on the left.
    ...(IS_MAC
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 13 } }
      : { titleBarStyle: 'hidden', titleBarOverlay: { color: c.bar, symbolColor: c.fg, height: 40 } }),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: true,
      spellcheck: true
    }
  });
  if (!IS_MAC) win.removeMenu();   // macOS uses the app menu bar (see buildMacMenu)
  const entry = { win, incognito, partition, aiPartition, appsPartition, pendingUrls: urls, restore };
  windows.set(win.id, entry);
  win.loadFile(path.join(__dirname, 'index.html'), { query: { incognito: incognito ? '1' : '0' } });
  win.once('ready-to-show', () => { showSmooth(win); if (!IS_MAC && getSettings().appIcon) applyAppIcon(); });
  hookShortcuts(win.webContents);
  win.on('enter-full-screen', () => win.webContents.send('fullscreen', true));
  win.on('leave-full-screen', () => win.webContents.send('fullscreen', false));
  win.on('closed', () => {
    windows.delete(win.id);
    const otherPersistent = [...windows.values()].some((w) => !w.incognito);
    if (!incognito && !quitting && otherPersistent) sessions.delete(win.id);
    saveSessions();
  });
  if (process.env.STUPID_SELFTEST && windows.size === 1) selfTest(win);
  return win;
}

const entryFor = (wc) => {
  const host = wc && (wc.getType() === 'webview' ? wc.hostWebContents : wc);
  const win = host && BrowserWindow.fromWebContents(host);
  return win ? windows.get(win.id) : null;
};
const shellFor = (wc) => { const e = entryFor(wc); return e && !e.win.isDestroyed() ? e.win.webContents : null; };

function broadcast(channel, payload) {
  for (const wc of webContents.getAllWebContents()) {
    if (wc.isDestroyed()) continue;
    const t = wc.getType();
    if (t === 'window' || (t === 'webview' && wc.getURL().startsWith('stupid://'))) wc.send(channel, payload);
  }
}

function saveSessions() {
  if (!sessions.size && !quitting) return;
  store.write('session.json', [...sessions.values()].filter((s) => s.tabs && s.tabs.length), 200);
}

/* =========================================================================
   Session preparation: UA, protocol, permissions, downloads, history, DNT, passwords
   ========================================================================= */
function prepareSession(ses, { tabs, incognito }) {
  if (preparedSessions.has(ses)) return;
  preparedSessions.add(ses);
  ses.setUserAgent(UA);
  ses.setSpellCheckerLanguages(['en-US', 'sv-SE'].filter((l) => ses.availableSpellCheckerLanguages.includes(l)));

  // stupid:// internal pages
  ses.protocol.handle('stupid', (req) => {
    const u = new URL(req.url);
    const host = u.hostname;
    if (!INTERNAL_PAGES.includes(host)) return new Response('Not found', { status: 404 });
    let rel = decodeURIComponent(u.pathname);
    if (host === 'rewind' && rewindThumb) { const r = rewindThumb(rel); if (r) return r; }
    if (rel === '/' || rel === '') rel = `/${host}.html`;
    const base = rel.startsWith('/fonts/') || rel.startsWith('/assets/') ? __dirname : path.join(__dirname, 'pages');
    const target = path.normalize(path.join(base, rel));
    if (!target.startsWith(base + path.sep)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(target).toString());
  });

  // Permissions: camera, microphone, location, notifications -> per-site allow/ask/block
  ses.setPermissionRequestHandler((wc, permission, callback, details) => handlePermission(wc, permission, callback, details, incognito));
  ses.setPermissionCheckHandler((wc, permission, origin, details) => {
    const kinds = permKinds(permission, details && details.mediaType ? { mediaTypes: [details.mediaType] } : {});
    if (!kinds) return !['openExternal', 'hid', 'serial', 'usb'].includes(permission);
    const site = (getSitePerms()[origin]) || {};
    return kinds.every((k) => site[k] === 'allow');
  });

  ses.on('will-download', (_e, item, wc) => handleDownload(item, wc, incognito));

  // Do Not Track / Global Privacy Control headers
  ses.webRequest.onBeforeSendHeaders((details, cb) => {
    if (getSettings().dnt && /^https?:/.test(details.url)) {
      details.requestHeaders.DNT = '1';
      details.requestHeaders['Sec-GPC'] = '1';
    }
    cb({ requestHeaders: details.requestHeaders });
  });

  if (tabs && !incognito) {
    ses.registerPreloadScript({ type: 'frame', filePath: path.join(__dirname, 'page-preload.js') });
  }
  // Highlighted text → "Ask Buddy" button in the browser UI (tabs only).
  if (tabs) ses.registerPreloadScript({ type: 'frame', filePath: path.join(__dirname, 'select-preload.js') });
  // Music island: lets the browser UI read "now playing" and press play/pause/next (all web sessions).
  ses.registerPreloadScript({ type: 'frame', filePath: path.join(__dirname, 'media-preload.js') });
  if (tabs) {
    ses.__stupidTabs = true;
    ses.__incognito = incognito;
    if (getSettings().adblock) setAdblock(true, ses);
  }
}

/* ---------- permissions ---------- */
let permReqSeq = 0;
const pendingPerms = new Map();
function permKinds(permission, details = {}) {
  if (permission === 'geolocation') return ['location'];
  if (permission === 'notifications') return ['notifications'];
  if (permission === 'media') {
    const t = details.mediaTypes || [];
    const k = [];
    if (t.includes('video')) k.push('camera');
    if (t.includes('audio')) k.push('microphone');
    return k.length ? k : ['camera', 'microphone'];
  }
  return null;
}
function handlePermission(wc, permission, callback, details, incognito) {
  if (permission === 'openExternal') {
    const ext = details.externalURL || '';
    if (/^(mailto|tel|ms-settings|steam|discord|spotify|zoommtg|msteams):/i.test(ext)) return callback(true);
    return callback(false);
  }
  const kinds = permKinds(permission, details);
  if (!kinds) return callback(['clipboard-sanitized-write', 'clipboard-read', 'fullscreen', 'pointerLock', 'keyboardLock', 'window-management', 'speaker-selection'].includes(permission));
  let origin;
  try { origin = new URL(details.requestingUrl || wc.getURL()).origin; } catch { return callback(false); }
  if (origin.startsWith('stupid://')) return callback(false);
  const site = getSitePerms()[origin] || {};
  if (kinds.some((k) => site[k] === 'block')) return callback(false);
  if (kinds.every((k) => site[k] === 'allow')) return callback(true);
  const shellWc = shellFor(wc);
  if (!shellWc) return callback(false);
  const id = ++permReqSeq;
  pendingPerms.set(id, { callback, origin, kinds, incognito });
  wc.once('destroyed', () => resolvePerm(id, false, false));
  shellWc.send('perm:prompt', { id, origin, kinds, wcId: wc.id });
}
function resolvePerm(id, allow, remember) {
  const p = pendingPerms.get(id);
  if (!p) return;
  pendingPerms.delete(id);
  if (remember && !p.incognito) {
    const all = getSitePerms();
    all[p.origin] = all[p.origin] || {};
    for (const k of p.kinds) all[p.origin][k] = allow ? 'allow' : 'block';
    store.write('site-permissions.json', all);
    broadcast('perms:changed', all);
  }
  try { p.callback(!!allow); } catch {}
}

/* ---------- downloads ---------- */
const liveDownloads = new Map();   // id -> DownloadItem
let dlSeq = 0;
const getDownloads = () => store.read('downloads.json', []);
function dlPublic(d) { return Object.assign({}, d); }
function uniquePath(dir, name) {
  const ext = path.extname(name); const base = path.basename(name, ext);
  let p = path.join(dir, name); let i = 1;
  while (fs.existsSync(p)) p = path.join(dir, `${base} (${i++})${ext}`);
  return p;
}
function handleDownload(item, wc, incognito) {
  const s = getSettings();
  const id = Date.now().toString(36) + '-' + (++dlSeq);
  if (!s.askWhereToSave) {
    let dir = s.downloadDir;
    try { fs.mkdirSync(dir, { recursive: true }); } catch { dir = app.getPath('downloads'); }
    item.setSavePath(uniquePath(dir, item.getFilename()));
  }
  const rec = { id, filename: item.getFilename(), url: item.getURL(), savePath: item.getSavePath(), state: 'progressing', received: 0, total: item.getTotalBytes(), ts: Date.now(), incognito, paused: false };
  liveDownloads.set(id, item);
  const list = getDownloads(); list.unshift(rec); store.write('downloads.json', incognito ? list : list.slice(0, 500));
  const update = (patch) => {
    Object.assign(rec, patch, { savePath: item.getSavePath() || rec.savePath, filename: path.basename(item.getSavePath() || rec.filename) });
    store.write('downloads.json', getDownloads(), 1000);
    broadcast('downloads:update', dlPublic(rec));
  };
  const shellWc = shellFor(wc);
  if (shellWc) shellWc.send('downloads:started', dlPublic(rec));
  item.on('updated', (_e, state) => update({ state: state === 'interrupted' ? 'interrupted' : 'progressing', received: item.getReceivedBytes(), total: item.getTotalBytes(), paused: item.isPaused() }));
  item.once('done', (_e, state) => {
    liveDownloads.delete(id);
    update({ state, received: item.getReceivedBytes() });
    if (incognito) { /* keep in memory list only until quit */ rec.incognito = true; }
  });
}

/* ---------- history ---------- */
function addHistory(url, title) {
  if (!/^https?:\/\//.test(url)) return;
  const h = getHistory();
  const last = h[h.length - 1];
  if (last && last.url === url && Date.now() - last.ts < 30000) { if (title) last.title = title; store.write('history.json', h, 1500); return; }
  h.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), url, title: title || url, ts: Date.now() });
  if (h.length > 20000) h.splice(0, h.length - 20000);
  store.write('history.json', h, 1500);
}
function titleHistory(url, title) {
  const h = getHistory();
  for (let i = h.length - 1; i >= Math.max(0, h.length - 30); i--) if (h[i].url === url) { h[i].title = title; break; }
  store.write('history.json', h, 1500);
}
function suggest(q, limit = 7) {
  q = String(q || '').trim().toLowerCase();
  if (!q) return [];
  const scores = new Map();
  const add = (url, title, score, kind) => {
    const cur = scores.get(url);
    if (cur) { cur.score += score; if (kind === 'bookmark') cur.kind = 'bookmark'; if (title && cur.title === url) cur.title = title; }
    else scores.set(url, { url, title: title || url, score, kind });
  };
  const now = Date.now();
  const strip = (u) => u.replace(/^https?:\/\/(www\.)?/, '');
  for (const b of getBookmarks()) if (b.type === 'bookmark' && ((b.title || '').toLowerCase().includes(q) || strip(b.url).toLowerCase().includes(q))) add(b.url, b.title, strip(b.url).toLowerCase().startsWith(q) ? 30 : 15, 'bookmark');
  const h = getHistory();
  for (let i = h.length - 1; i >= 0 && i > h.length - 5000; i--) {
    const e = h[i];
    const su = strip(e.url).toLowerCase();
    const prefix = su.startsWith(q);
    if (prefix || su.includes(q) || (e.title || '').toLowerCase().includes(q)) {
      const age = (now - e.ts) / 86400000;
      add(e.url, e.title, (prefix ? 6 : 2) / (1 + age / 7), 'history');
    }
  }
  return [...scores.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

/* ---------- passwords (encrypted with OS safeStorage) ---------- */
const enc = (s) => (safeStorage.isEncryptionAvailable() ? 'e:' + safeStorage.encryptString(s).toString('base64') : 'p:' + Buffer.from(s).toString('base64'));
const dec = (s) => { try { return s.startsWith('e:') ? safeStorage.decryptString(Buffer.from(s.slice(2), 'base64')) : Buffer.from(s.slice(2), 'base64').toString(); } catch { return ''; } };
const pendingPwSaves = new Map();
let pwSeq = 0;

/* ---------- ad & tracker blocker ---------- */
let blocker = null, blockedCount = 0;
const blockingOn = new WeakSet();
let blockingCount = 0;
function loadBlocker() {
  if (blocker) return blocker;
  try {
    const { ElectronBlocker } = require('@ghostery/adblocker-electron');
    blocker = ElectronBlocker.deserialize(new Uint8Array(fs.readFileSync(path.join(__dirname, 'assets', 'adblock.bin'))));
    blocker.on('request-blocked', () => { blockedCount++; broadcastCount(); });
  } catch (e) { console.error('Adblocker failed to load:', e); blocker = null; }
  return blocker;
}
let countTimer = null;
function broadcastCount() { if (countTimer) return; countTimer = setTimeout(() => { countTimer = null; broadcast('adblock:count', blockedCount); }, 500); }
function tabSessions() { const out = new Set([session.fromPartition(PERSIST)]); for (const w of windows.values()) out.add(session.fromPartition(w.partition)); return [...out]; }
function setAdblock(on, only) {
  const b = loadBlocker();
  if (!b) return { on: false, count: blockedCount, error: true };
  // Ghostery registers *global* ipcMain handlers per session (same handler for all), so a second
  // session would throw. Remove them before enabling another session, and restore them after a
  // disable if other sessions still block.
  const AB_CHANNELS = ['@ghostery/adblocker/inject-cosmetic-filters', '@ghostery/adblocker/is-mutation-observer-enabled'];
  const dropHandlers = () => AB_CHANNELS.forEach((c) => ipcMain.removeHandler(c));
  for (const s of only ? [only] : tabSessions()) {
    try {
      if (on && !blockingOn.has(s)) { dropHandlers(); b.enableBlockingInSession(s); blockingOn.add(s); blockingCount++; }
      if (!on && blockingOn.has(s)) { b.disableBlockingInSession(s); blockingOn.delete(s); blockingCount--; }
    } catch (e) { console.error('adblock toggle failed', e); }
  }
  if (blockingCount > 0) {
    dropHandlers();
    ipcMain.handle(AB_CHANNELS[0], (e, url, msg) => b.onInjectCosmeticFilters(e, url, msg));
    ipcMain.handle(AB_CHANNELS[1], (e) => b.onIsMutationObserverEnabled(e));
  }
  return { on, count: blockedCount };
}

/* ---------- theme / font size side effects ---------- */
// Your logo as the Dock / taskbar icon (Settings → Appearance), or the default icon.
function applyAppIcon() {
  const s = getSettings();
  let img = null;
  if (s.appIcon && s.appIconImage) { try { img = nativeImage.createFromDataURL(s.appIconImage); if (img.isEmpty()) img = null; } catch { img = null; } }
  if (!img) img = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'));
  if (IS_MAC && app.dock) app.dock.setIcon(img);
  else for (const { win } of windows.values()) if (!win.isDestroyed()) win.setIcon(img);
}
function applySettingsSideEffects(patch) {
  if ('theme' in patch) nativeTheme.themeSource = ['light', 'dark'].includes(patch.theme) ? patch.theme : 'system';
  if ('adblock' in patch) setAdblock(!!patch.adblock);
  if ('appIcon' in patch || 'appIconImage' in patch) applyAppIcon();
  if ('wordmark' in patch) for (const { win, incognito } of windows.values()) if (!win.isDestroyed()) win.setTitle(windowTitle(incognito));
  if ('eq' in patch) {
    // Equalizer runs inside web pages (media-preload.js); push the new curve to every page.
    for (const wc of webContents.getAllWebContents()) {
      if (!wc.isDestroyed() && wc.getType() === 'webview' && /^https?:/.test(wc.getURL())) wc.send('eq:update', getSettings().eq);
    }
  }
}
nativeTheme.on('updated', () => {
  for (const { win, incognito } of windows.values()) {
    if (win.isDestroyed()) continue;
    const c = themeColors(incognito);
    win.setBackgroundColor(c.bg);
    if (!IS_MAC) { try { win.setTitleBarOverlay({ color: c.bar, symbolColor: c.fg, height: 40 }); } catch {} }
  }
});

/* =========================================================================
   IPC (each channel checks who is calling)
   ========================================================================= */
const isShell = (e) => e.sender.getType() === 'window' && !!entryFor(e.sender);
const isInternal = (e) => { try { return e.senderFrame && e.senderFrame.url.startsWith('stupid://'); } catch { return false; } };
function handle(channel, who, fn) {
  ipcMain.handle(channel, (e, ...args) => {
    const ok = (who.includes('shell') && isShell(e)) || (who.includes('internal') && isInternal(e));
    if (!ok) throw new Error('Not allowed: ' + channel);
    return fn(e, ...args);
  });
}
const ANY = ['shell', 'internal'];

handle('win:info', ['shell'], (e) => { const w = entryFor(e.sender); const r = w.restore; w.restore = null; const u = w.pendingUrls; w.pendingUrls = null; return { incognito: w.incognito, partition: w.partition, ai: w.aiPartition, apps: w.appsPartition, restore: r, urls: u, version: app.getVersion() }; });
handle('settings:get', ANY, () => publicSettings());
handle('settings:set', ANY, (_e, patch) => { if (patch && typeof patch === 'object') setSettings(cleanPatch(patch)); return publicSettings(); });
// macOS: write the browser name + logo into the app itself (Finder / Dock), then restart. reset=true restores the originals.
handle('brand:status', ['internal'], () => (IS_MAC ? require('./mac-brand').status() : { supported: false }));
handle('brand:apply', ['internal'], async (_e, reset) => {
  const brand = require('./mac-brand'), s = getSettings();
  await brand.apply(reset ? { name: brand.DEFAULT_NAME, iconDataUrl: null } : { name: s.wordmark || brand.DEFAULT_NAME, iconDataUrl: s.appIcon && s.appIconImage ? s.appIconImage : null });
  setSettings({ brandBundle: !reset });
  setTimeout(() => app.quit(), 150);
  return true;
});
// Values that end up in pages or audio graphs get checked here.
function cleanPatch(patch) {
  const p = Object.assign({}, patch);
  if ('logo' in p && !['ring', 'emoji', 'image', 'none'].includes(p.logo)) delete p.logo;
  if ('logoEmoji' in p) p.logoEmoji = String(p.logoEmoji || '').slice(0, 16);
  if ('quoteMode' in p && !['browser', 'mine', 'mix'].includes(p.quoteMode)) delete p.quoteMode;
  if ('myQuotes' in p) p.myQuotes = (Array.isArray(p.myQuotes) ? p.myQuotes : []).map((q) => String(q).trim().slice(0, 200)).filter(Boolean).slice(0, 100);
  if ('wordmark' in p) p.wordmark = String(p.wordmark || '').slice(0, 40);
  if ('logoImage' in p && !(p.logoImage === '' || (typeof p.logoImage === 'string' && p.logoImage.length < 400000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(p.logoImage)))) delete p.logoImage;
  if ('eq' in p) p.eq = cleanEq(p.eq);
  if ('aiButton' in p && !['buddy', 'sidebar', 'off'].includes(p.aiButton)) delete p.aiButton;
  if ('bg' in p && !/^(none|image|preset:[a-z]{2,16})$/.test(String(p.bg))) delete p.bg;
  if ('buddyLook' in p) {
    const L = p.buddyLook && typeof p.buddyLook === 'object' ? p.buddyLook : {};
    const col = (v, keys, d) => (keys.includes(v) || /^#[0-9a-f]{6}$/i.test(String(v)) ? String(v) : d);
    p.buddyLook = {
      name: String(L.name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 20) || 'Buddy',
      color: col(L.color, ['cream', 'clay', 'cocoa', 'sky', 'mint', 'grape', 'rose', 'sun', 'night', 'snow'], 'cream'),
      glow: col(L.glow, ['cyan', 'green', 'pink', 'amber', 'white', 'violet'], 'cyan'),
      extra: ['none', 'headphones', 'cap', 'bow', 'crown', 'glasses', 'flower'].includes(L.extra) ? L.extra : 'none',
      shape: ['hiker', 'round', 'cube', 'capsule', 'egg', 'tv'].includes(L.shape) ? L.shape : 'hiker',
      eyes: ['dot', 'round', 'sleepy', 'wide', 'lash'].includes(L.eyes) ? L.eyes : 'dot',
      mouth: ['smile', 'grin', 'flat', 'open', 'cat'].includes(L.mouth) ? L.mouth : 'smile',
      outfit: col(L.outfit, ['cream', 'clay', 'cocoa', 'sky', 'mint', 'grape', 'rose', 'sun', 'night', 'snow'], 'clay'),
      backpack: L.backpack !== false, scarf: L.scarf !== false,
      hat: ['none', 'tophat', 'cap', 'beanie', 'crown', 'party', 'cowboy', 'headphones', 'halo'].includes(L.hat) ? L.hat : 'none',
      glasses: ['none', 'round', 'square', 'shades', 'star', 'heart'].includes(L.glasses) ? L.glasses : 'none',
      image: typeof L.image === 'string' && L.image.length < 300000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(L.image) ? L.image : ''
    };
  }
  delete p.brandBundle;   // only brand:apply sets this
  for (const k of ['modernLook', 'verticalTabs', 'compactMode', 'rewind', 'clock24']) if (k in p) p[k] = !!p[k];
  const pick = (k, list) => { if (k in p && !list.includes(p[k])) delete p[k]; };
  pick('uiFont', ['inter', 'system', 'serif', 'rounded', 'mono']); pick('density', ['compact', 'comfortable', 'spacious']);
  pick('corners', ['sharp', 'rounded', 'round']); pick('tabStyle', ['classic', 'pills', 'minimal']); pick('frameTint', ['none', 'soft', 'strong']);
  if ('hideButtons' in p) p.hideButtons = (Array.isArray(p.hideButtons) ? p.hideButtons : []).filter((b) => ['shield', 'pip', 'ai', 'grid', 'profile', 'home', 'sidebarBtn'].includes(b));
  if ('accent' in p && !(/^[a-z]{2,12}$/.test(String(p.accent)) || /^#[0-9a-f]{6}$/i.test(String(p.accent)))) delete p.accent;
  if ('rewindExclude' in p) p.rewindExclude = (Array.isArray(p.rewindExclude) ? p.rewindExclude : []).map((d) => String(d).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '')).filter((d) => /^[a-z0-9.-]{3,253}$/.test(d)).slice(0, 200);
  if ('appIcon' in p) p.appIcon = !!p.appIcon;
  if ('appIconImage' in p && !(p.appIconImage === '' || (typeof p.appIconImage === 'string' && p.appIconImage.length < 1500000 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(p.appIconImage)))) delete p.appIconImage;
  if ('tabSleep' in p && ![0, 5, 15, 30, 60, 120].includes(+p.tabSleep)) delete p.tabSleep; else if ('tabSleep' in p) p.tabSleep = +p.tabSleep;
  if ('bgDim' in p) p.bgDim = Math.max(0, Math.min(70, Math.round(+p.bgDim || 0)));
  if ('buddy' in p) {
    const b = p.buddy && typeof p.buddy === 'object' ? p.buddy : {};
    const PROV = ['anthropic', 'openai', 'gemini', 'xai', 'mistral', 'openrouter', 'ollama', 'custom'];
    const models = {}, bases = {};
    for (const k of PROV) {
      const m = b.models && b.models[k]; if (typeof m === 'string' && /^[\w.:\/@+-]{1,120}$/.test(m)) models[k] = m;
      const u = b.bases && b.bases[k]; if (typeof u === 'string' && /^https?:\/\/[^\s]{1,300}$/.test(u)) bases[k] = u;
    }
    if (!models.anthropic) models.anthropic = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'].includes(b.model) ? b.model : 'claude-opus-5-5';
    if (!['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'].includes(models.anthropic)) models.anthropic = 'claude-opus-5-5';
    p.buddy = { enabled: b.enabled !== false, provider: PROV.includes(b.provider) ? b.provider : 'anthropic', models, bases, look: b.look !== false };
  }
  return p;
}
const cleanEq = (eq) => {
  const g = Array.isArray(eq && eq.gains) ? eq.gains : [];
  return { on: !!(eq && eq.on), preset: String((eq && eq.preset) || 'custom').slice(0, 20), gains: Array.from({ length: 8 }, (_, i) => Math.max(-12, Math.min(12, Math.round((+g[i] || 0) * 2) / 2))) };
};
handle('settings:reset', ['internal'], () => { const keep = { pinned: getSettings().pinned }; store.write('settings.json', keep); applySettingsSideEffects(DEFAULT_SETTINGS()); broadcast('settings:changed', publicSettings()); return publicSettings(); });

handle('bookmarks:get', ANY, () => getBookmarks());
handle('bookmarks:set', ANY, (_e, list) => { if (Array.isArray(list)) { store.write('bookmarks.json', list); broadcast('bookmarks:changed', list); } return true; });
handle('bookmarks:folderMenu', ['shell'], (e, folderId, x, y) => {
  const all = getBookmarks();
  const build = (pid) => {
    const items = all.filter((b) => b.parentId === pid).map((b) => b.type === 'folder'
      ? { label: b.title || 'Folder', submenu: build(b.id) }
      : { label: (b.title || b.url).slice(0, 60), click: () => e.sender.send('open-url', { url: b.url, where: 'current' }) });
    return items.length ? items : [{ label: '(empty)', enabled: false }];
  };
  Menu.buildFromTemplate(build(folderId)).popup({ window: BrowserWindow.fromWebContents(e.sender), x: Math.round(x), y: Math.round(y) });
});

handle('bots:get', ANY, () => getBots());
handle('bots:set', ANY, (_e, list) => { if (Array.isArray(list)) { store.write('ai-bots.json', list); broadcast('bots:changed', list); } return true; });
handle('bots:defaults', ANY, () => DEFAULT_BOTS);
handle('sidebar:get', ANY, () => store.read('sidebar.json', DEFAULT_SIDEBAR));
handle('sidebar:set', ANY, (_e, list) => { if (Array.isArray(list)) { store.write('sidebar.json', list.slice(0, 40)); broadcast('sidebar:changed', list); } return true; });
handle('sidebar:defaults', ANY, () => DEFAULT_SIDEBAR);
const cleanLauncher = (list) => list.filter((x) => x && typeof x.name === 'string' && (x.url === 'mail' || /^https?:\/\//i.test(String(x.url))))
  .slice(0, 60).map((x) => ({ id: String(x.id || 'l' + Date.now().toString(36)).slice(0, 40), name: x.name.slice(0, 40), url: String(x.url).slice(0, 2000) }));
handle('launcher:get', ANY, () => store.read('launcher.json', DEFAULT_LAUNCHER));
handle('launcher:set', ANY, (_e, list) => { if (Array.isArray(list)) { const l = cleanLauncher(list); store.write('launcher.json', l); broadcast('launcher:changed', l); } return true; });
handle('launcher:defaults', ANY, () => DEFAULT_LAUNCHER);
// New-tab widgets (src/pages/widgets.js). Each: { id, type, config }.
const WIDGET_TYPES = ['weather', 'notes', 'todo', 'clock', 'calendar', 'countdown', 'custom'];
const num = (v, lo, hi) => Math.max(lo, Math.min(hi, +v || 0));
const cleanWidgets = (list) => list.filter((w) => w && WIDGET_TYPES.includes(w.type)).slice(0, 20).map((w) => {
  let config = w.config && typeof w.config === 'object' ? w.config : {};
  if (JSON.stringify(config).length > (w.type === 'custom' ? 600000 : 20000)) config = {};   // custom widgets may hold a photo
  const out = { id: String(w.id || 'w' + Date.now().toString(36)).slice(0, 40), type: w.type, config };
  if (w.pos && typeof w.pos === 'object') out.pos = { x: num(w.pos.x, 0, 1), y: num(w.pos.y, 0, 1), w: num(w.pos.w, 160, 900) };
  return out;
});
// New-tab background photo, kept out of settings.json so settings broadcasts stay small.
handle('background:get', ['internal'], () => store.read('background.json', { image: '' }).image || '');
handle('background:set', ['internal'], (_e, image) => {
  image = String(image || '');
  if (image && !(image.length < 6e6 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image))) return false;
  store.write('background.json', { image }); broadcast('background:changed', true); return true;
});
handle('widgets:get', ['internal'], () => store.read('widgets.json', [{ id: 'w-weather', type: 'weather', config: {} }, { id: 'w-todo', type: 'todo', config: { items: [] } }, { id: 'w-notes', type: 'notes', config: { text: '' } }]));
handle('widgets:set', ['internal'], (_e, list) => { if (Array.isArray(list)) { const l = cleanWidgets(list); store.write('widgets.json', l); broadcast('widgets:changed', l); } return true; });

handle('history:suggest', ['shell'], (_e, q) => suggest(q));
handle('history:query', ['internal'], (_e, q, limit = 300, before = Infinity) => {
  q = String(q || '').toLowerCase();
  const h = getHistory(); const out = [];
  for (let i = h.length - 1; i >= 0 && out.length < limit; i--) {
    const x = h[i];
    if (x.ts >= before) continue;
    if (!q || (x.title || '').toLowerCase().includes(q) || x.url.toLowerCase().includes(q)) out.push(x);
  }
  return out;
});
handle('history:delete', ['internal'], (_e, ids) => { const set = new Set(ids || []); store.write('history.json', getHistory().filter((x) => !set.has(x.id))); return true; });

handle('downloads:list', ANY, () => getDownloads());
handle('downloads:action', ANY, async (_e, id, action) => {
  const rec = getDownloads().find((d) => d.id === id);
  const item = liveDownloads.get(id);
  switch (action) {
    case 'open': if (rec) { const err = await shell.openPath(rec.savePath); return !err; } break;
    case 'show': if (rec) shell.showItemInFolder(rec.savePath); break;
    case 'cancel': if (item) item.cancel(); break;
    case 'pause': if (item) item.pause(); break;
    case 'resume': if (item && item.canResume()) item.resume(); break;
    case 'retry': if (rec) session.fromPartition(PERSIST).downloadURL(rec.url); break;
    case 'remove': store.write('downloads.json', getDownloads().filter((d) => d.id !== id)); broadcast('downloads:removed', id); break;
  }
  return true;
});
handle('downloads:clear', ANY, () => { const list = getDownloads().filter((d) => d.state === 'progressing'); store.write('downloads.json', list); broadcast('downloads:cleared', true); return true; });
handle('downloads:chooseDir', ['internal'], async (e) => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender.hostWebContents || e.sender), { properties: ['openDirectory', 'createDirectory'], defaultPath: getSettings().downloadDir });
  if (r.canceled || !r.filePaths[0]) return null;
  setSettings({ downloadDir: r.filePaths[0] });
  return r.filePaths[0];
});

handle('perm:respond', ['shell'], (_e, id, allow, remember) => resolvePerm(id, allow, remember));
handle('perms:get', ANY, () => getSitePerms());
handle('perms:set', ANY, (_e, origin, kind, value) => {
  if (!PERM_KINDS.includes(kind) || typeof origin !== 'string') return false;
  const all = getSitePerms();
  all[origin] = all[origin] || {};
  if (value === 'ask') delete all[origin][kind]; else all[origin][kind] = value === 'allow' ? 'allow' : 'block';
  if (!Object.keys(all[origin]).length) delete all[origin];
  store.write('site-permissions.json', all); broadcast('perms:changed', all); return all;
});
handle('site:clearData', ['shell'], async (e, origin) => {
  const w = entryFor(e.sender);
  await session.fromPartition(w.partition).clearStorageData({ origin });
  return true;
});

handle('privacy:clear', ['internal'], async (_e, { range, history, cookies, cache, downloads }) => {
  const since = range > 0 ? Date.now() - range : 0;
  if (history) store.write('history.json', getHistory().filter((x) => x.ts < since));
  if (downloads) store.write('downloads.json', getDownloads().filter((x) => x.state === 'progressing' || x.ts < since));
  for (const p of [PERSIST, PERSIST_AI]) {
    const s = session.fromPartition(p);
    if (cookies) await s.clearStorageData({ storages: ['cookies', 'localstorage', 'indexdb', 'websql', 'serviceworkers', 'cachestorage', 'filesystem', 'shadercache'] });
    if (cache) { await s.clearCache(); await s.clearCodeCaches({}); }
  }
  return true;
});

handle('adblock:set', ANY, (_e, on) => { setSettings({ adblock: !!on }); return { on: !!on, count: blockedCount }; });
handle('adblock:get', ANY, () => ({ on: getSettings().adblock, count: blockedCount }));

handle('session:save', ['shell'], (e, data) => {
  const w = entryFor(e.sender);
  if (!w || w.incognito || !data) return;
  sessions.set(w.win.id, { tabs: (data.tabs || []).slice(0, 200), groups: (data.groups || []).slice(0, 50), active: data.active | 0 });
  saveSessions();
});

handle('win:new', ANY, (_e, opts = {}) => { createWindow({ incognito: !!opts.incognito, urls: opts.url ? [opts.url] : null }); });
handle('win:fullscreen', ['shell'], (e) => { const w = BrowserWindow.fromWebContents(e.sender); w.setFullScreen(!w.isFullScreen()); });
handle('win:close', ['shell'], (e) => BrowserWindow.fromWebContents(e.sender).close());

handle('pw:respond', ['shell'], (_e, id, action) => {
  const p = pendingPwSaves.get(id); pendingPwSaves.delete(id);
  if (!p) return;
  const list = getPasswords();
  if (action === 'never') { list.push({ id: 'n' + Date.now(), origin: p.origin, never: true }); store.write('passwords.json', list); return; }
  if (action !== 'save') return;
  const existing = list.find((x) => x.origin === p.origin && !x.never && x.username === p.username);
  if (existing) { existing.password = enc(p.password); existing.updated = Date.now(); }
  else list.push({ id: 'p' + Date.now().toString(36), origin: p.origin, username: p.username, password: enc(p.password), created: Date.now() });
  store.write('passwords.json', list); broadcast('passwords:changed', true);
});
handle('pw:list', ['internal'], () => getPasswords().map((x) => ({ id: x.id, origin: x.origin, username: x.username || '', never: !!x.never, created: x.created })));
handle('pw:reveal', ['internal'], (_e, id) => { const x = getPasswords().find((p) => p.id === id); return x && !x.never ? dec(x.password) : ''; });
handle('pw:delete', ['internal'], (_e, id) => { store.write('passwords.json', getPasswords().filter((p) => p.id !== id)); return true; });
handle('pw:encryption', ['internal'], () => safeStorage.isEncryptionAvailable());
// Compact mode hides the macOS traffic lights while the top bar is tucked away.
handle('win:trafficLights', ['shell'], (e, on) => { const w = BrowserWindow.fromWebContents(e.sender); if (IS_MAC && w && w.setWindowButtonVisibility) w.setWindowButtonVisibility(!!on); return true; });
handle('profiles:list', ['shell'], () => ({ current: profiles.CURRENT, list: profiles.list() }));
handle('profiles:picker', ['internal'], (_e, on) => (on === undefined ? { on: profiles.pickerEnabled(), count: profiles.list().length } : profiles.setPicker(on)));
handle('profiles:open', ['shell'], (_e, id) => profiles.open(String(id)));
handle('profiles:create', ['shell'], (_e, p) => { const made = profiles.create(p); if (made) profiles.open(made.id); return made; });
handle('profiles:remove', ['shell'], (_e, id) => profiles.remove(String(id)));
require('./buddy-main')({ handle, store, enc, dec, getSettings, entryFor });
const rewindThumb = require('./rewind-main')({ app, handle, store, getSettings, entryFor, broadcast });
require('./import-bookmarks')({ handle, store, getBookmarks, broadcast, getHistory, getPasswords, enc });

handle('default:status', ['internal'], () => ({ http: app.isDefaultProtocolClient('http'), https: app.isDefaultProtocolClient('https'), platform: process.platform }));
handle('default:set', ['internal'], async () => {
  app.setAsDefaultProtocolClient('http'); app.setAsDefaultProtocolClient('https');
  // macOS shows its own "change default browser?" confirmation for the call above.
  if (process.platform === 'win32') {
    try { await shell.openExternal('ms-settings:defaultapps?registeredAppUser=The%20Stupid%20Browser'); }
    catch { try { await shell.openExternal('ms-settings:defaultapps'); } catch {} }
  }
  return true;
});
handle('about:info', ['internal'], () => ({ version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node, platform: `${os.type()} ${os.release()} ${process.arch}`, userData: app.getPath('userData') }));

// Password helper preload (runs inside web pages): origin-checked by the frame that sends.
ipcMain.handle('eq:get', (e) => (e.sender.getType() === 'webview' ? cleanEq(getSettings().eq) : null));
ipcMain.handle('pw:query', (e) => {
  if (e.sender.getType() !== 'webview' || !getSettings().savePasswords) return [];
  let origin; try { origin = e.senderFrame.origin; } catch { return []; }
  if (!/^https?:/.test(origin)) return [];
  return getPasswords().filter((p) => p.origin === origin && !p.never).map((p) => ({ username: p.username, password: dec(p.password) }));
});
ipcMain.on('pw:submitted', (e, data) => {
  if (e.sender.getType() !== 'webview' || !data || !getSettings().savePasswords) return;
  let origin; try { origin = e.senderFrame.origin; } catch { return; }
  if (!/^https?:/.test(origin)) return;
  const username = String(data.username || '').slice(0, 300); const password = String(data.password || '').slice(0, 1000);
  if (!password) return;
  const list = getPasswords();
  if (list.some((p) => p.origin === origin && p.never)) return;
  const same = list.find((p) => p.origin === origin && !p.never && p.username === username);
  if (same && dec(same.password) === password) return;
  const shellWc = shellFor(e.sender); if (!shellWc) return;
  if (entryFor(e.sender).incognito) return;
  const id = ++pwSeq;
  pendingPwSaves.set(id, { origin, username, password });
  shellWc.send('pw:offer', { id, origin, username, update: !!same });
});

/* =========================================================================
   Auto-updates (electron-updater + GitHub Releases, NSIS installer only)
   ========================================================================= */
const IS_PORTABLE = !!process.env.PORTABLE_EXECUTABLE_DIR;
const UPDATE_EVERY = 4 * 60 * 60 * 1000;
const updateState = { status: 'idle', version: null, progress: 0, error: null, lastCheck: null, current: app.getVersion(), portable: IS_PORTABLE, packaged: app.isPackaged };
let autoUpdater = null;
function setUpdate(patch) { Object.assign(updateState, patch); broadcast('update:status', Object.assign({}, updateState)); }
let macUpdater = null;
function initUpdater() {
  // macOS: our own updater (works without an Apple Developer ID); see mac-updater.js
  if (IS_MAC && (app.isPackaged || process.env.STUPID_UPDATE_TEST_FEED)) {
    macUpdater = autoUpdater = require('./mac-updater')({ setUpdate, log: (m) => console.log(m), afterSwap: (p) => require('./mac-brand').relabelAfterUpdate(p, getSettings()) });
    setTimeout(checkForUpdates, 10000);
    setInterval(checkForUpdates, UPDATE_EVERY);
    return;
  }
  if (!app.isPackaged || IS_PORTABLE || process.platform !== 'win32') {
    setUpdate({ status: 'unsupported' });
    return;
  }
  try { ({ autoUpdater } = require('electron-updater')); } catch (e) { setUpdate({ status: 'error', error: 'Updater missing' }); return; }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;   // installs on quit if the user doesn't restart
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = { info: (m) => console.log('[updater]', m), warn: (m) => console.warn('[updater]', m), error: (m) => console.error('[updater]', m), debug: () => {} };
  autoUpdater.on('checking-for-update', () => setUpdate({ status: 'checking', error: null }));
  autoUpdater.on('update-available', (i) => setUpdate({ status: 'downloading', version: i.version, progress: 0 }));
  autoUpdater.on('update-not-available', () => setUpdate({ status: 'none', lastCheck: Date.now() }));
  autoUpdater.on('download-progress', (p) => setUpdate({ status: 'downloading', progress: Math.round(p.percent || 0) }));
  autoUpdater.on('update-downloaded', (i) => setUpdate({ status: 'ready', version: i.version, progress: 100, lastCheck: Date.now() }));
  autoUpdater.on('error', (err) => setUpdate({ status: 'error', error: String((err && err.message) || err).split('\n')[0].slice(0, 200), lastCheck: Date.now() }));
  setTimeout(checkForUpdates, 10000);
  setInterval(checkForUpdates, UPDATE_EVERY);
}
function checkForUpdates() {
  if (!autoUpdater) return Object.assign({}, updateState);
  if (['checking', 'downloading', 'ready'].includes(updateState.status)) return Object.assign({}, updateState);
  Promise.resolve(autoUpdater.checkForUpdates()).catch((err) => setUpdate({ status: 'error', error: String(err && err.message || err).split('\n')[0].slice(0, 200) }));
  return Object.assign({}, updateState);
}
handle('update:status', ANY, () => Object.assign({}, updateState));
handle('update:check', ANY, () => { if (!autoUpdater) return Object.assign({}, updateState); setUpdate({ status: 'checking' }); return checkForUpdates(); });
handle('update:install', ANY, () => {
  if (!autoUpdater || updateState.status !== 'ready') return false;
  quitting = true; saveSessions(); store.flushAll();
  setImmediate(() => autoUpdater.quitAndInstall(false, true));   // show installer progress, relaunch after
  return true;
});

/* =========================================================================
   Keyboard shortcuts (Chrome-consistent)
   ========================================================================= */
function shortcutFor(input) {
  if (input.type !== 'keyDown') return null;
  const k = (input.key || '').toLowerCase();
  const code = input.code || '';
  if (IS_MAC) { const m = macShortcutFor(input, k, code); if (m !== undefined) return m; }
  // On macOS Ctrl+letter is text editing (Ctrl+A/E/K…), so only Cmd counts there.
  const ctrl = IS_MAC ? input.meta : (input.control || input.meta);
  const shift = input.shift, alt = input.alt;
  if (k === 'f12' || (ctrl && shift && k === 'i')) return 'devtools';
  if (ctrl && shift && k === 'j') return 'devtools';
  if (k === 'f11') return 'fullscreen';
  if (k === 'f5') return shift ? 'hard-reload' : 'reload';
  if (k === 'f3') return shift ? 'find-prev' : 'find-next';
  if (k === 'f6' || (alt && !ctrl && k === 'd')) return 'focus-address';
  if (alt && !ctrl && k === 'arrowleft') return 'back';
  if (alt && !ctrl && k === 'arrowright') return 'forward';
  if (alt && !ctrl && k === 'home') return 'home';
  if (k === 'browserback') return 'back';
  if (k === 'browserforward') return 'forward';
  if (!ctrl) return null;
  if (shift) {
    if (k === 't') return 'reopen-tab';
    if (k === 'n') return 'new-incognito';
    if (k === 'w') return 'close-window';
    if (k === 'a') return 'toggle-ai';
    if (k === 'e') return 'toggle-sidebar';
    if (k === 'b') return 'toggle-bookmarks-bar';
    if (k === 'o') return 'bookmarks';
    if (k === 'y') return 'rewind';
    if (k === 's') return 'split';
    if (k === 'r') return 'hard-reload';
    if (k === 'delete') return 'clear-data';
    if (k === 'tab') return 'prev-tab';
    if (k === 'g') return 'find-prev';
    if (k === '+' || k === '=' || code === 'Equal' || code === 'NumpadAdd') return 'zoom-in';
    return null;
  }
  if (k === 'tab' || k === 'pagedown') return k === 'tab' ? 'next-tab' : 'next-tab';
  if (k === 'pageup') return 'prev-tab';
  if (k === 't') return 'new-tab';
  if (k === 'n') return 'new-window';
  if (k === 'w' || k === 'f4') return 'close-tab';
  if (k === 'l') return 'focus-address';
  if (k === 'k') return 'command-bar';
  if (k === 'd') return 'bookmark';
  if (k === 'r') return 'reload';
  if (k === 'h') return 'history';
  if (k === 'j') return 'downloads';
  if (k === 'f') return 'find';
  if (k === 'g') return 'find-next';
  if (k === 'p') return 'print';
  if (k === 'u') return 'view-source';
  if (k === ',') return 'settings';
  if (k === '+' || k === '=' || code === 'NumpadAdd') return 'zoom-in';
  if (k === '-' || code === 'NumpadSubtract') return 'zoom-out';
  if (k === '0' || code === 'Numpad0') return 'zoom-reset';
  if (/^[1-9]$/.test(k)) return 'tab-' + k;
  return null;
}
// macOS (Chrome for Mac) bindings. Returns undefined to fall through to the shared table.
function macShortcutFor(input, k, code) {
  const cmd = input.meta, shift = input.shift, alt = input.alt, ctl = input.control;
  if (ctl && !cmd && k === 'tab') return shift ? 'prev-tab' : 'next-tab';
  if (ctl && cmd && k === 'f') return 'fullscreen';
  if (ctl) return null;
  if (!cmd) return (k === 'f12' || k === 'f5' || k === 'f3' || k === 'f6') ? undefined : null;
  if (alt) {
    if (k === 'i' || code === 'KeyI' || k === 'j' || code === 'KeyJ') return 'devtools';
    if (k === 'u' || code === 'KeyU') return 'view-source';
    if (k === 'b' || code === 'KeyB') return 'bookmarks';
    if (k === 'arrowright') return 'next-tab';
    if (k === 'arrowleft') return 'prev-tab';
    return null;
  }
  if (shift) {
    if (code === 'BracketRight' || k === '}') return 'next-tab';
    if (code === 'BracketLeft' || k === '{') return 'prev-tab';
    if (k === 'h') return 'home';
    if (k === 'j') return 'downloads';
    if (k === 'backspace' || k === 'delete') return 'clear-data';
    if (k === 'w') return 'close-window';
    return undefined;
  }
  if (k === '[' || code === 'BracketLeft') return 'back';      // not Cmd+Arrow: that's line start/end in text fields
  if (k === ']' || code === 'BracketRight') return 'forward';
  if (k === 'y') return 'history';
  if (k === 'h' || k === 'q' || k === 'm' || k === 'c' || k === 'v' || k === 'x' || k === 'a' || k === 'z') return null;   // app menu roles
  return undefined;
}
// Easter egg: the Konami code (↑ ↑ ↓ ↓ ← → ← → B A) opens the Zelda "secret found" sound.
const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
const KONAMI_URL = 'https://www.youtube.com/watch?v=0vngOmw2hcM&autoplay=1';
const konamiProgress = new Map();   // shell webContents id -> keys matched so far
function konami(target, input) {
  if (input.type !== 'keyDown' || input.isAutoRepeat || input.control || input.meta || input.alt) return;
  const k = (input.key || '').toLowerCase();
  let n = konamiProgress.get(target.id) || 0;
  n = k === KONAMI[n] ? n + 1 : (k === KONAMI[0] ? (n === 2 && k === 'arrowup' ? 2 : 1) : 0);
  if (n === KONAMI.length) { n = 0; target.send('open-url', { url: KONAMI_URL, where: 'foreground' }); }
  konamiProgress.set(target.id, n);
}
function hookShortcuts(wc) {
  wc.on('before-input-event', (event, input) => {
    { const t = shellFor(wc); if (t) konami(t, input); }
    const cmd = shortcutFor(input);
    if (!cmd) return;
    const target = shellFor(wc);
    if (!target) return;
    // Let normal text editing keys through in the shell itself (only the listed combos are captured).
    event.preventDefault();
    if (cmd === 'new-window') return createWindow();
    if (cmd === 'new-incognito') return createWindow({ incognito: true });
    if (cmd === 'fullscreen') { const w = BrowserWindow.fromWebContents(target); return w.setFullScreen(!w.isFullScreen()); }
    target.send('shortcut', cmd);
  });
}

/* =========================================================================
   Web page context menu
   ========================================================================= */
function pageContextMenu(wc, p) {
  const shellWc = shellFor(wc); if (!shellWc) return;
  const win = BrowserWindow.fromWebContents(shellWc);
  const s = getSettings();
  const engine = s.search === 'custom' ? 'the web' : (SEARCH_ENGINES[s.search] || SEARCH_ENGINES.google).name;
  const openUrl = (url, where) => shellWc.send('open-url', { url, where });
  const T = [];
  const sep = () => { if (T.length && T[T.length - 1].type !== 'separator') T.push({ type: 'separator' }); };
  if (p.linkURL && /^(https?|stupid):/.test(p.linkURL)) {
    T.push({ label: 'Open link in new tab', click: () => openUrl(p.linkURL, 'background') });
    T.push({ label: 'Open link in new window', click: () => createWindow({ urls: [p.linkURL] }) });
    T.push({ label: 'Open link in private window', click: () => createWindow({ incognito: true, urls: [p.linkURL] }) });
    T.push({ label: 'Save link as…', click: () => wc.downloadURL(p.linkURL) });
    T.push({ label: 'Copy link address', click: () => clipboard.writeText(p.linkURL) });
    sep();
  }
  if (p.mediaType === 'image' && p.srcURL) {
    T.push({ label: 'Open image in new tab', click: () => openUrl(p.srcURL, 'background') });
    T.push({ label: 'Save image as…', click: () => wc.downloadURL(p.srcURL) });
    T.push({ label: 'Copy image', click: () => wc.copyImageAt(p.x, p.y) });
    T.push({ label: 'Copy image address', click: () => clipboard.writeText(p.srcURL) });
    sep();
  }
  if ((p.mediaType === 'video' || p.mediaType === 'audio') && p.srcURL && !p.srcURL.startsWith('blob:')) {
    T.push({ label: `Save ${p.mediaType} as…`, click: () => wc.downloadURL(p.srcURL) });
    T.push({ label: `Copy ${p.mediaType} address`, click: () => clipboard.writeText(p.srcURL) });
    sep();
  }
  if (p.isEditable) {
    if (p.misspelledWord && p.dictionarySuggestions) {
      for (const sug of p.dictionarySuggestions.slice(0, 4)) T.push({ label: sug, click: () => wc.replaceMisspelling(sug) });
      if (p.dictionarySuggestions.length) sep();
    }
    T.push({ label: 'Undo', role: 'undo', enabled: p.editFlags.canUndo });
    T.push({ label: 'Redo', role: 'redo', enabled: p.editFlags.canRedo });
    sep();
    T.push({ label: 'Cut', role: 'cut', enabled: p.editFlags.canCut });
    T.push({ label: 'Copy', role: 'copy', enabled: p.editFlags.canCopy });
    T.push({ label: 'Paste', role: 'paste', enabled: p.editFlags.canPaste });
    T.push({ label: 'Select all', role: 'selectAll' });
    sep();
  } else if (p.selectionText && p.selectionText.trim()) {
    const sel = p.selectionText.trim();
    T.push({ label: 'Copy', role: 'copy' });
    const short = sel.length > 28 ? sel.slice(0, 28) + '…' : sel;
    T.push({ label: `Search ${engine} for “${short}”`, click: () => openUrl(searchUrlFor(s).replace('%s', encodeURIComponent(sel)), 'foreground') });
    T.push({ label: 'Ask AI about this', click: () => { clipboard.writeText(sel); shellWc.send('shortcut', 'open-ai'); } });
    sep();
  }
  if (!p.linkURL && !p.isEditable && !(p.selectionText && p.selectionText.trim()) && p.mediaType === 'none') {
    T.push({ label: 'Back', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() });
    T.push({ label: 'Forward', enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() });
    T.push({ label: 'Reload', click: () => wc.reload() });
    sep();
    T.push({ label: 'Save page as…', click: () => wc.downloadURL(wc.getURL()) });
    T.push({ label: 'Print…', click: () => shellWc.send('shortcut', 'print') });
    T.push({ label: 'View page source', click: () => shellWc.send('shortcut', 'view-source') });
    sep();
  }
  T.push({ label: 'Inspect', click: () => { wc.inspectElement(p.x, p.y); } });
  Menu.buildFromTemplate(T).popup({ window: win });
}

/* =========================================================================
   webview hardening + per-tab hooks
   ========================================================================= */
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (_ev, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.nodeIntegrationInSubFrames = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.defaultFontSize = FONT_SIZES[getSettings().fontSize] || 16;
    const src = params.src || 'about:blank';
    if (!/^(https?:|stupid:|about:|file:)/.test(src)) params.src = 'about:blank';
    if (src.startsWith('stupid://')) webPreferences.preload = path.join(__dirname, 'internal-preload.js');
  });

  if (contents.getType() !== 'webview') return;
  hookShortcuts(contents);
  contents.setWindowOpenHandler(({ url, disposition }) => {
    const shellWc = shellFor(contents);
    if (/^(https?|stupid):/.test(url) && shellWc) shellWc.send('open-url', { url, where: disposition === 'background-tab' ? 'background' : 'foreground', opener: contents.id });
    else if (/^mailto:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('context-menu', (_ev, params) => pageContextMenu(contents, params));
  // Internal-page preload only exposes its bridge on stupid:// (and main re-checks every call), so
  // following a link from an internal page to the web is safe.
  const record = () => { const s = contents.session; return s.__stupidTabs && !s.__incognito; };
  contents.on('did-navigate', (_ev, url) => { if (record()) addHistory(url, contents.getTitle()); });
  contents.on('did-navigate-in-page', (_ev, url, isMainFrame) => { if (isMainFrame && record()) addHistory(url, contents.getTitle()); });
  contents.on('page-title-updated', (_ev, title) => { if (record()) titleHistory(contents.getURL(), title); });
});

/* =========================================================================
   Self-test (dev only): STUPID_SELFTEST=/tmp/shot.png
   ========================================================================= */
function selfTest(win) {
  win.webContents.on('console-message', async (e) => {
    console.log('[renderer]', e.level, e.message);
    const m = /^SHOT:(\S+)/.exec(e.message || '');
    if (m && !win.isDestroyed()) { const img = await win.capturePage(); fs.writeFileSync(process.env.STUPID_SELFTEST.replace('.png', '-' + m[1] + '.png'), img.toPNG()); console.log('[selftest] shot', m[1]); }
    if (/^QUIT$/.test(e.message || '')) app.quit();
  });
  if (process.env.STUPID_SELFTEST_SCRIPT) {
    win.webContents.once('did-finish-load', () => setTimeout(() => {
      win.webContents.executeJavaScript(fs.readFileSync(process.env.STUPID_SELFTEST_SCRIPT, 'utf8')).catch((err) => console.log('[selftest] script error', err.message));
    }, 2500));
  }
  const steps = (process.env.STUPID_SELFTEST_STEPS || 'shot:base@6000,quit@8000').split(',');
  for (const s of steps) {
    const [what, at] = s.split('@');
    setTimeout(async () => {
      if (win.isDestroyed()) return;
      if (what === 'quit') return app.quit();
      if (what.startsWith('shot:')) { const img = await win.capturePage(); fs.writeFileSync(process.env.STUPID_SELFTEST.replace('.png', '-' + what.slice(5) + '.png'), img.toPNG()); return; }
      if (what.startsWith('cmd:')) return win.webContents.send('shortcut', what.slice(4));
      if (what.startsWith('url:')) return win.webContents.send('open-url', { url: decodeURIComponent(what.slice(4)), where: 'current' });
      if (what.startsWith('js:')) { try { console.log('[selftest]', JSON.stringify(await win.webContents.executeJavaScript(decodeURIComponent(what.slice(3))))); } catch (err) { console.log('[selftest] js error', err.message); } }
    }, +at);
  }
}

/* =========================================================================
   App lifecycle
   ========================================================================= */
const urlFromArgv = (argv) => argv.slice(1).find((a) => /^(https?:\/\/|file:\/\/)/i.test(a) || /\.(html?|pdf|svg)$/i.test(a));
function normalizeArgUrl(a) { if (!a) return null; if (/^(https?|file):/i.test(a)) return a; try { return pathToFileURL(path.resolve(a)).toString(); } catch { return null; } }

function openFromOutside(url) {
  const w = [...windows.values()].reverse().find((x) => !x.incognito && !x.win.isDestroyed());
  if (w) {
    if (w.win.isMinimized()) w.win.restore();
    w.win.focus();
    if (url) w.win.webContents.send('open-url', { url, where: 'foreground' });
    else w.win.webContents.send('shortcut', 'new-tab');
  } else createWindow({ urls: url ? [url] : null });
}

// "Who's browsing?" — Chrome-style profile picker at launch when there is more than one profile.
let pickerWin = null;
function showProfilePicker() {
  pickerWin = new BrowserWindow({
    width: 760, height: 540, resizable: false, minimizable: true, maximizable: false, show: false,
    title: 'Who’s browsing?', backgroundColor: themeColors(false).bg,
    ...(IS_MAC ? { titleBarStyle: 'hiddenInset' } : { titleBarStyle: 'hidden', titleBarOverlay: { color: themeColors(false).bg, symbolColor: themeColors(false).fg, height: 36 } }),
    webPreferences: { preload: path.join(__dirname, 'picker-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  pickerWin.removeMenu();
  pickerWin.loadFile(path.join(__dirname, 'picker.html'));
  pickerWin.once('ready-to-show', () => showSmooth(pickerWin));
  pickerWin.on('closed', () => { const w = pickerWin; pickerWin = null; if (w && !w.__chosen && !windows.size) { if (IS_MAC) return; app.quit(); } });
}
const fromPicker = (e) => pickerWin && !pickerWin.isDestroyed() && e.sender === pickerWin.webContents;
ipcMain.handle('picker:list', (e) => (fromPicker(e) ? { list: profiles.list(), show: profiles.pickerEnabled() } : null));
ipcMain.handle('picker:show', (e, on) => (fromPicker(e) ? profiles.setPicker(on) : null));
ipcMain.handle('picker:add', (e, p) => {
  if (!fromPicker(e)) return null;
  const made = profiles.create(p || {}); if (!made) return null;
  pickerWin.__chosen = true; profiles.open(made.id); pickerWin.close(); if (!windows.size) app.quit();
  return true;
});
ipcMain.handle('picker:choose', (e, id) => {
  if (!fromPicker(e)) return null;
  id = String(id || 'default');
  pickerWin.__chosen = true;
  const w = pickerWin;
  if (id === 'default') { openStartupWindows([]); setTimeout(() => fadeWin(w, 0, 220, () => { if (!w.isDestroyed()) w.close(); }), 120); }
  else { profiles.open(id); fadeWin(w, 0, 260, () => { if (!w.isDestroyed()) w.close(); if (!windows.size) setTimeout(() => app.quit(), 400); }); }
  return true;
});

function openStartupWindows(extraUrls) {
  const s = getSettings();
  const saved = store.read('session.json', []);
  if (s.startup === 'continue' && saved.length) {
    saved.forEach((sess, i) => createWindow({ restore: sess, urls: i === 0 && extraUrls.length ? extraUrls : null }));
  } else if (s.startup === 'pages' && s.startupPages && s.startupPages.length) {
    createWindow({ urls: [...s.startupPages, ...extraUrls] });
  } else {
    createWindow({ urls: extraUrls.length ? extraUrls : null });
  }
}

// macOS application menu. Without it Cmd+C/V/X/A/Z don't work and there's no Quit/Hide.
// Browser shortcuts are handled in hookShortcuts; menu items just send the same commands.
function buildMacMenu() {
  const send = (cmd) => () => {
    const w = BrowserWindow.getFocusedWindow();
    if (w && windows.has(w.id)) w.webContents.send('shortcut', cmd); else if (cmd === 'new-tab') createWindow();
  };
  const T = [
    { label: app.name, submenu: [
      { role: 'about' }, { type: 'separator' },
      { label: 'Settings…', accelerator: 'Cmd+,', registerAccelerator: false, click: send('settings') },
      { type: 'separator' }, { role: 'services' }, { type: 'separator' },
      { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }
    ] },
    { label: 'File', submenu: [
      { label: 'New Tab', accelerator: 'Cmd+T', registerAccelerator: false, click: send('new-tab') },
      { label: 'New Window', accelerator: 'Cmd+N', registerAccelerator: false, click: () => createWindow() },
      { label: 'New Private Window', accelerator: 'Cmd+Shift+N', registerAccelerator: false, click: () => createWindow({ incognito: true }) },
      { label: 'Reopen Closed Tab', accelerator: 'Cmd+Shift+T', registerAccelerator: false, click: send('reopen-tab') },
      { type: 'separator' },
      { label: 'Open Location…', accelerator: 'Cmd+L', registerAccelerator: false, click: send('focus-address') },
      { label: 'Close Tab', accelerator: 'Cmd+W', registerAccelerator: false, click: send('close-tab') },
      { label: 'Close Window', accelerator: 'Cmd+Shift+W', registerAccelerator: false, click: send('close-window') },
      { type: 'separator' },
      { label: 'Print…', accelerator: 'Cmd+P', registerAccelerator: false, click: send('print') }
    ] },
    { role: 'editMenu' },
    { label: 'View', submenu: [
      { label: 'Reload', accelerator: 'Cmd+R', registerAccelerator: false, click: send('reload') },
      { label: 'Toggle Sidebar', accelerator: 'Cmd+Shift+E', registerAccelerator: false, click: send('toggle-sidebar') },
      { label: 'Toggle AI Sidebar', accelerator: 'Cmd+Shift+A', registerAccelerator: false, click: send('toggle-ai') },
      { label: 'Toggle Bookmarks Bar', accelerator: 'Cmd+Shift+B', registerAccelerator: false, click: send('toggle-bookmarks-bar') },
      { type: 'separator' },
      { label: 'Actual Size', accelerator: 'Cmd+0', registerAccelerator: false, click: send('zoom-reset') },
      { label: 'Zoom In', accelerator: 'Cmd+Plus', registerAccelerator: false, click: send('zoom-in') },
      { label: 'Zoom Out', accelerator: 'Cmd+-', registerAccelerator: false, click: send('zoom-out') },
      { type: 'separator' },
      { label: 'Developer Tools', accelerator: 'Cmd+Alt+I', registerAccelerator: false, click: send('devtools') },
      { role: 'togglefullscreen' }
    ] },
    { label: 'History', submenu: [
      { label: 'Back', accelerator: 'Cmd+[', registerAccelerator: false, click: send('back') },
      { label: 'Forward', accelerator: 'Cmd+]', registerAccelerator: false, click: send('forward') },
      { label: 'Home', accelerator: 'Cmd+Shift+H', registerAccelerator: false, click: send('home') },
      { type: 'separator' },
      { label: 'Show All History', accelerator: 'Cmd+Y', registerAccelerator: false, click: send('history') }
    ] },
    { label: 'Bookmarks', submenu: [
      { label: 'Bookmark This Tab', accelerator: 'Cmd+D', registerAccelerator: false, click: send('bookmark') },
      { label: 'Bookmark Manager', accelerator: 'Cmd+Alt+B', registerAccelerator: false, click: send('bookmarks') }
    ] },
    { role: 'windowMenu' },
    { role: 'help', submenu: [{ label: 'The Stupid Browser on GitHub', click: () => shell.openExternal('https://github.com/lattewirell-creator/stupid-browser') }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(T));
}

// macOS delivers links and files through events instead of argv (and may do so before "ready").
const pendingOpen = [];
if (IS_MAC) {
  const queueOrOpen = (url) => { if (!url) return; if (app.isReady() && windows.size) openFromOutside(url); else pendingOpen.push(url); };
  app.on('open-url', (e, url) => { e.preventDefault(); if (/^https?:/i.test(url)) queueOrOpen(url); });
  app.on('open-file', (e, file) => { e.preventDefault(); queueOrOpen(normalizeArgUrl(file)); });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => openFromOutside(normalizeArgUrl(urlFromArgv(argv))));

  app.whenReady().then(() => {
    // Brand-new install (no settings yet): open the welcome screen once.
    const firstRun = !fs.existsSync(path.join(app.getPath('userData'), 'settings.json'));
    const s = getSettings();
    nativeTheme.themeSource = ['light', 'dark'].includes(s.theme) ? s.theme : 'system';
    if (IS_MAC) buildMacMenu();
    profiles.sync(s);
    if (s.appIcon) setTimeout(applyAppIcon, 500);
    const argUrl = normalizeArgUrl(urlFromArgv(process.argv));
    if (firstRun) { setSettings({ onboarded: false }); createWindow({ urls: ['stupid://welcome/', ...(argUrl ? [argUrl] : []), ...pendingOpen.splice(0)] }); }
    else if (profiles.CURRENT === 'default' && !argUrl && !pendingOpen.length && profiles.list().length > 1 && profiles.pickerEnabled() && !process.env.STUPID_SELFTEST) showProfilePicker();
    else openStartupWindows([...(argUrl ? [argUrl] : []), ...pendingOpen.splice(0)]);
    app.on('activate', () => {
      if (windows.size) return;
      if (pickerWin && !pickerWin.isDestroyed()) { pickerWin.focus(); return; }
      // Dock click after closing every window (macOS): start fresh like a relaunch.
      sessions.clear();
      openStartupWindows(pendingOpen.splice(0));
    });
    initUpdater();
  });
}

app.on('before-quit', () => { quitting = true; saveSessions(); store.flushAll(); if (macUpdater && updateState.status === 'ready') macUpdater.installOnQuit(); });
app.on('window-all-closed', () => {
  // macOS keeps the app alive in the Dock; the last window's tabs are already in session.json.
  if (IS_MAC) { saveSessions(); store.flushAll(); return; }
  quitting = true; saveSessions(); store.flushAll(); app.quit();
});
