'use strict';
// Chrome extensions, in normal windows (never in private ones, like Chrome by default).
//
// electron-chrome-extensions gives extensions the Chrome APIs Electron lacks (tabs, windows, the toolbar button and its
// popup, context menus…), bridged here to the browser's own tabs (webviews) and windows. electron-chrome-web-store makes
// "Add to Chrome" on the Chrome Web Store install here, and keeps those extensions up to date. Extensions you already
// use in another browser can be brought over (see importable/importFrom).
const { session, BrowserWindow, webContents, app, nativeImage } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ID = /^[a-p]{32}$/;
let ext = null, store = null, ses = null, hooks = null;
const pending = new Map();   // createTab requests waiting for the window to make the tab
let reqSeq = 0;

function setup({ partition, settings, saveSettings, shellOf, openWindow, persistentWindow }) {
  hooks = { settings, saveSettings, shellOf, openWindow, persistentWindow };
  ses = session.fromPartition(partition);
  const { ElectronChromeExtensions } = require('electron-chrome-extensions');
  ext = new ElectronChromeExtensions({
    session: ses,
    // chrome.tabs.create: the window makes a real tab and says which webContents it got.
    createTab(details) {
      const win = (details.windowId && BrowserWindow.fromId(details.windowId)) || persistentWindow();
      const shell = win && !win.isDestroyed() && win.webContents;
      if (!shell) return Promise.reject(new Error('No window'));
      const id = ++reqSeq;
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => { pending.delete(id); reject(new Error('Tab not created')); }, 10000);
        pending.set(id, (wcId) => { clearTimeout(t); const wc = webContents.fromId(wcId); if (wc) resolve([wc, win]); else reject(new Error('Tab not created')); });
        shell.send('ext:createTab', { id, url: /^(https?|chrome-extension|stupid):/.test(details.url || '') ? details.url : '', active: details.active !== false });
      });
    },
    selectTab(wc, win) { if (win && !win.isDestroyed()) { win.webContents.send('ext:selectTab', wc.id); if (!win.isFocused()) win.focus(); } },
    removeTab(wc, win) { if (win && !win.isDestroyed()) win.webContents.send('ext:closeTab', wc.id); },
    createWindow(details) {
      const url = Array.isArray(details.url) ? details.url[0] : details.url;
      return Promise.resolve(openWindow(url && /^(https?|chrome-extension):/.test(url) ? url : null));
    },
    removeWindow(win) { if (win && !win.isDestroyed()) win.close(); },
  });
  // The toolbar buttons (in the browser window, which lives in the default session) get their icons from crx://.
  ElectronChromeExtensions.handleCRXProtocol(session.defaultSession);

  store = require('electron-chrome-web-store');
  return store.installChromeWebStore({
    session: ses,
    extensionsPath: path.join(app.getPath('userData'), 'Extensions'),
    autoUpdate: true,
    loadExtensions: true,
    allowUnpackedExtensions: false,
    // "Add to Chrome" on the store asks first, in the browser's own words.
    beforeInstall: async (details) => {
      const { dialog } = require('electron');
      const win = details.browserWindow || persistentWindow();
      const name = (details.localizedName || details.manifest && details.manifest.name || 'this extension');
      const r = await dialog.showMessageBox(win, { type: 'question', buttons: ['Add extension', 'Cancel'], defaultId: 0, cancelId: 1, title: 'Add extension', message: `Add “${name}” to The Stupid Browser?`, detail: 'It can read and change the pages you visit, like in Chrome. You can remove it any time in Settings → Extensions.', icon: details.icon || undefined });
      return { action: r.response === 0 ? 'allow' : 'deny' };
    },
  }).then(() => loadLocal()).then(() => applyDisabled()).catch((e) => console.error('[extensions]', e));
}

// The "Add to The Stupid Browser" button on a Chrome Web Store page (store-preload.js). Asks first.
function storeStatus(id) { return { installed: !!(ID.test(id) && installedDirs().has(id)) }; }
async function installFromStore(id, name, win) {
  if (!ID.test(id)) return { error: 'Not an extension' };
  if (installedDirs().has(id)) return { installed: true };
  const { dialog } = require('electron');
  const r = process.env.STUPID_SELFTEST && process.env.STUPID_TEST_AUTOCONFIRM ? { response: 0 } : await dialog.showMessageBox(win, { type: 'question', buttons: ['Add extension', 'Cancel'], defaultId: 0, cancelId: 1, title: 'Add extension', message: `Add “${name || 'this extension'}” to The Stupid Browser?`, detail: 'It can read and change the pages you visit, like in Chrome. You can turn it off or remove it any time in Settings → Extensions.' });
  if (r.response !== 0) return { installed: false };
  try {
    await store.installExtension(id, { session: ses, extensionsPath: path.join(app.getPath('userData'), 'Extensions') });
    const off = new Set(hooks.settings().extensionsOff || []); if (off.delete(id)) hooks.saveSettings({ extensionsOff: [...off] });
    return { installed: true };
  } catch (e) { console.error('[extensions] install', id, e.message); return { error: 'Couldn’t add it — try again' }; }
}
// The window made the tab an extension asked for.
function tabCreated(id, wcId) { const f = pending.get(id); if (f) { pending.delete(id); f(wcId); } }
// A tab joins (or leaves) the extensions' view of the world.
function addTab(wc, win) { if (ext && wc.session === ses) try { ext.addTab(wc, win); } catch {} }
function selectTab(wc) { if (ext && wc && wc.session === ses) try { ext.selectTab(wc); } catch {} }
function contextMenuItems(wc, params) { try { return ext && wc.session === ses ? ext.getContextMenuItems(wc, params) : []; } catch { return []; } }

/* ---------- managing them (Settings → Extensions) ---------- */
const localDir = () => path.join(app.getPath('userData'), 'Extensions-local');   // copied from another browser (not in the store)
async function loadLocal() {
  let ids = []; try { ids = fs.readdirSync(localDir()).filter((d) => ID.test(d)); } catch {}
  for (const id of ids) { if (!ses.extensions.getExtension(id)) try { await ses.extensions.loadExtension(path.join(localDir(), id), { allowFileAccess: false }); } catch (e) { console.error('[extensions] local', id, e.message); } }
}
// "Off" keeps an extension installed but not running (it's loaded again when turned on).
function applyDisabled() {
  const off = new Set(hooks.settings().extensionsOff || []);
  for (const e of ses.extensions.getAllExtensions()) if (off.has(e.id)) try { ses.extensions.removeExtension(e.id); } catch {}
}
function installedDirs() {
  const out = new Map();
  const base = path.join(app.getPath('userData'), 'Extensions');
  for (const [root, local] of [[base, false], [localDir(), true]]) {
    let ids = []; try { ids = fs.readdirSync(root).filter((d) => ID.test(d)); } catch {}
    for (const id of ids) {
      const dir = path.join(root, id);
      // the store keeps <id>/<version>/; a local copy is <id>/ itself
      let d = dir;
      if (!fs.existsSync(path.join(dir, 'manifest.json'))) { const v = newestVersionDir(dir); if (!v) continue; d = v; }
      out.set(id, { id, dir: d, local });
    }
  }
  return out;
}
function newestVersionDir(dir) {
  let v = []; try { v = fs.readdirSync(dir).filter((x) => fs.existsSync(path.join(dir, x, 'manifest.json'))); } catch {}
  v.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return v.length ? path.join(dir, v[v.length - 1]) : null;
}
function readManifest(dir) {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8').replace(/^﻿/, ''));
    const msg = (s) => {
      const k = /^__MSG_(.+)__$/.exec(String(s || '')); if (!k) return s || '';
      for (const loc of [String(app.getLocale() || '').replace('-', '_'), String(app.getLocale() || '').split('-')[0], m.default_locale, 'en', 'en_US']) {
        if (!loc) continue;
        try { const j = JSON.parse(fs.readFileSync(path.join(dir, '_locales', loc, 'messages.json'), 'utf8').replace(/^﻿/, '')); const hit = Object.entries(j).find(([kk]) => kk.toLowerCase() === k[1].toLowerCase()); if (hit) return hit[1].message; } catch {}
      }
      return k[1];
    };
    const icons = m.icons || (m.action && m.action.default_icon) || (m.browser_action && m.browser_action.default_icon) || {};
    const iconRel = typeof icons === 'string' ? icons : (icons[128] || icons[96] || icons[64] || icons[48] || icons[32] || icons[19] || icons[16] || Object.values(icons)[0]);
    return { name: msg(m.name), description: msg(m.description), version: m.version || '', icon: iconRel ? path.join(dir, iconRel) : '', options: m.options_page || (m.options_ui && m.options_ui.page) || '', mv: m.manifest_version || 2 };
  } catch { return null; }
}
const iconData = (p) => { try { if (!p || !fs.existsSync(p)) return ''; const img = nativeImage.createFromPath(p); return img.isEmpty() ? '' : img.resize({ width: 32, height: 32, quality: 'best' }).toDataURL(); } catch { return ''; } };

function list() {
  if (!ses) return [];
  const off = new Set(hooks.settings().extensionsOff || []);
  return [...installedDirs().values()].map(({ id, dir, local }) => {
    const m = readManifest(dir); if (!m) return null;
    const loaded = !!ses.extensions.getExtension(id);
    return { id, name: m.name || id, description: m.description, version: m.version, icon: iconData(m.icon), on: !off.has(id), running: loaded, local, options: m.options ? `chrome-extension://${id}/${m.options.replace(/^\//, '')}` : '' };
  }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}
async function setOn(id, on) {
  if (!ID.test(id)) return list();
  const off = new Set(hooks.settings().extensionsOff || []);
  if (on) { off.delete(id); const d = installedDirs().get(id); if (d && !ses.extensions.getExtension(id)) try { await ses.extensions.loadExtension(d.dir); } catch (e) { console.error('[extensions] load', e.message); } }
  else { off.add(id); try { ses.extensions.removeExtension(id); } catch {} }
  hooks.saveSettings({ extensionsOff: [...off] });
  return list();
}
async function remove(id) {
  if (!ID.test(id)) return list();
  try { ses.extensions.removeExtension(id); } catch {}
  const d = installedDirs().get(id);
  if (d) {
    const root = d.local ? path.join(localDir(), id) : path.join(app.getPath('userData'), 'Extensions', id);
    try { if (store.uninstallExtension && !d.local) await store.uninstallExtension(id, { session: ses, extensionsPath: path.join(app.getPath('userData'), 'Extensions') }); } catch {}
    try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
  }
  const off = new Set(hooks.settings().extensionsOff || []); off.delete(id); hooks.saveSettings({ extensionsOff: [...off] });
  return list();
}

/* ---------- bringing them over from other browsers ---------- */
const HOME = os.homedir(), LAD = process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local'), RAD = process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming');
const CHROMIUMS = process.platform === 'win32' ? [
  ['Chrome', path.join(LAD, 'Google', 'Chrome', 'User Data')], ['Edge', path.join(LAD, 'Microsoft', 'Edge', 'User Data')],
  ['Brave', path.join(LAD, 'BraveSoftware', 'Brave-Browser', 'User Data')], ['Vivaldi', path.join(LAD, 'Vivaldi', 'User Data')],
  ['Opera', path.join(RAD, 'Opera Software', 'Opera Stable')], ['Opera GX', path.join(RAD, 'Opera Software', 'Opera GX Stable')], ['Arc', path.join(LAD, 'Packages', 'TheBrowserCompany.Arc_ttt1ap7aakyb4', 'LocalCache', 'Local', 'Arc', 'User Data')],
] : process.platform === 'darwin' ? [
  ['Chrome', path.join(HOME, 'Library/Application Support/Google/Chrome')], ['Edge', path.join(HOME, 'Library/Application Support/Microsoft Edge')],
  ['Brave', path.join(HOME, 'Library/Application Support/BraveSoftware/Brave-Browser')], ['Vivaldi', path.join(HOME, 'Library/Application Support/Vivaldi')],
  ['Opera', path.join(HOME, 'Library/Application Support/com.operasoftware.Opera')], ['Arc', path.join(HOME, 'Library/Application Support/Arc/User Data')],
] : [
  ['Chrome', path.join(HOME, '.config/google-chrome')], ['Chromium', path.join(HOME, '.config/chromium')], ['Edge', path.join(HOME, '.config/microsoft-edge')],
  ['Brave', path.join(HOME, '.config/BraveSoftware/Brave-Browser')], ['Vivaldi', path.join(HOME, '.config/vivaldi')], ['Opera', path.join(HOME, '.config/opera')],
];
// Built into those browsers (not something you installed): never offered.
const BUILT_IN = new Set(['nmmhkkegccagdldgiimedpiccmgmieda', 'ghbmnnjooekpmoecnnnilnnbdlolhkhi', 'pkedcjkdefgpdelpbcmbmeomcjbeemfm', 'mhjfbmdgcfjbbpaeojofohoefgiehjai', 'aapocclcgogkmnckokdopfmhonfmgoek', 'aohghmighlieiainnegkcijnfilokake', 'apdfllckaahabafndbhieahigkjlhalf', 'blpcfgokakmgnkcojhhkbfbldkacnbeo', 'felcaaldnbdncclmgdcncolpebgiejap', 'pjkljhegncpnkpknbcohdijeoejaedia', 'jmjflgjpcpepeafmmgdpfkogkghcpiha', 'fikbjbembnmfhppjfnmfkahdhfohhjmg', 'ahfgeienlihckogmohjhadlkjgocpleb', 'dgiklkfkllikcanfonkcabmbdfmgleag', 'ncbjelpjchkpbikbpkcchkhkblodoama', 'jdiccldimpdaibmpdkjnbmckianbfold', 'odfafepnkmbhccpbejgmiehpchacaeak', 'kmendfapggjehodndflmmgagdbamhnfd']);
function profilesOf(userData) {
  const out = [];
  try {
    if (fs.existsSync(path.join(userData, 'Extensions'))) out.push(userData);   // Opera keeps one profile in the root
    for (const p of fs.readdirSync(userData)) if (/^(Default|Profile \d+)$/.test(p) && fs.existsSync(path.join(userData, p, 'Extensions'))) out.push(path.join(userData, p));
  } catch {}
  return out;
}
function enabledIn(profile) {
  // Preferences/Secure Preferences: extensions.settings[id].state (1 = on), from_webstore, location (1 = internal/store)
  const on = new Map();
  for (const f of ['Secure Preferences', 'Preferences']) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(profile, f), 'utf8'));
      const s = j.extensions && j.extensions.settings || {};
      for (const [id, v] of Object.entries(s)) { if (!on.has(id)) on.set(id, { enabled: !(v.disable_reasons && (Array.isArray(v.disable_reasons) ? v.disable_reasons.length : v.disable_reasons)) && v.state !== 0, store: !!v.from_webstore, location: v.location }); }
    } catch {}
  }
  return on;
}
// Firefox add-ons that also exist for Chrome browsers: brought over as their Chrome version.
const FIREFOX_TO_CHROME = {
  'uBlock0@raymondhill.net': 'ddkjiahejlhfcafbddmgiahcphecmpfh',   // uBlock Origin → uBlock Origin Lite (the full one left the Chrome store)
  '{446900e4-71c2-419f-a6a7-df9c091e268b}': 'nngceckbapebfimnlniiiahkandclblb',   // Bitwarden
  'addon@darkreader.org': 'eimadpbcbfnmbkopoojfekhnkhdbieeh',   // Dark Reader
  '{d634138d-c276-4fc8-924b-40a0ea21d284}': 'aeblfdkhhhdcdjpifhhbdiojplfjncoa',   // 1Password
  'support@lastpass.com': 'hdokiejnpimakedhajhdlcegeplioahd',   // LastPass
  '87677a2c52b84ad3a151a4a72f5bd3c4@jetpack': 'kbfnbcaeplbcioakkpcpgfkobkghlhen',   // Grammarly
  'jid1-MnnxcxisBPnSXQ@jetpack': 'pkehgijcmpdhfbdbbnkijodmdjhbjlgp',   // Privacy Badger
  'firefox@ghostery.com': 'mlomiejdfkolichcflejclcbmpeaniij',   // Ghostery
  'jid1-ZAdIEUB7XOzOJw@jetpack': 'bkdgflcldnnnapblkhphbgpggdiikppg',   // DuckDuckGo Privacy Essentials
  'sponsorBlocker@ajay.app': 'mnjggcdmjocbbbhaepdhchncahnbgone',   // SponsorBlock
  '{762f9885-5a13-4abd-9c77-433dcd38b8fd}': 'gebbhagfogifgggkldgodflihgfeippi',   // Return YouTube Dislike
  '78272b6fa58f4a1abaac99321d503a20@proton.me': 'ghmbeldphafepmbegfdlkpapadhbakde',   // Proton Pass
  'firefox@tampermonkey.net': 'dhdgffkkebhmkfjojejmpbldmpobfkfo',   // Tampermonkey
  '{d10d0bf8-f5b5-c8b4-a8b2-2b9879e08c5d}': 'cfhdojbkjhnklbpkdaibdccddilifddb',   // Adblock Plus
  'jid1-NIfFY2CA8fy1tg@jetpack': 'gighmmpiobklfepjocnamgkkbiglidom',   // AdBlock
  '{6AC85730-7D0F-4de0-B3FA-21142DD85326}': 'bhlhnicpbhignbdhedgjhgdocnmhomnp',   // ColorZilla
};
function firefoxProfiles() {
  const roots = process.platform === 'win32' ? [path.join(RAD, 'Mozilla', 'Firefox')] : process.platform === 'darwin' ? [path.join(HOME, 'Library/Application Support/Firefox')] : [path.join(HOME, '.mozilla/firefox'), path.join(HOME, 'snap/firefox/common/.mozilla/firefox')];
  const out = [];
  for (const r of roots) {
    let ini = ''; try { ini = fs.readFileSync(path.join(r, 'profiles.ini'), 'utf8'); } catch { continue; }
    for (const m of ini.matchAll(/Path=(.+)\r?\n/g)) { const rel = !/IsRelative=0/.test(ini); const p = rel ? path.join(r, m[1].trim()) : m[1].trim(); if (fs.existsSync(path.join(p, 'extensions.json'))) out.push(p); }
  }
  return out;
}
function importable() {
  const have = installedDirs(); const found = new Map();
  for (const [browser, ud] of CHROMIUMS) {
    for (const prof of profilesOf(ud)) {
      const st = enabledIn(prof);
      let ids = []; try { ids = fs.readdirSync(path.join(prof, 'Extensions')).filter((d) => ID.test(d)); } catch {}
      for (const id of ids) {
        if (BUILT_IN.has(id) || found.has(id)) continue;
        const s = st.get(id); if (s && !s.enabled) continue;   // only ones you have switched on there
        const dir = newestVersionDir(path.join(prof, 'Extensions', id)); if (!dir) continue;
        const m = readManifest(dir); if (!m || !m.name) continue;
        found.set(id, { key: id, chromeId: id, name: m.name, from: browser, icon: iconData(m.icon), installed: have.has(id), store: s ? s.store : true, dir });
      }
    }
  }
  for (const prof of firefoxProfiles()) {
    let j = {}; try { j = JSON.parse(fs.readFileSync(path.join(prof, 'extensions.json'), 'utf8')); } catch {}
    for (const a of j.addons || []) {
      if (a.type !== 'extension' || !a.active || a.location !== 'app-profile' || !a.defaultLocale) continue;
      const chromeId = FIREFOX_TO_CHROME[a.id];
      const key = 'ff:' + a.id; if (found.has(key) || (chromeId && found.has(chromeId))) continue;
      found.set(key, { key, chromeId: chromeId || '', name: a.defaultLocale.name || a.id, from: 'Firefox', icon: '', installed: !!(chromeId && have.has(chromeId)), store: !!chromeId, search: chromeId ? '' : `https://chromewebstore.google.com/search/${encodeURIComponent(a.defaultLocale.name || '')}` });
    }
  }
  return [...found.values()].map(({ dir, ...x }) => x).sort((a, b) => a.from.localeCompare(b.from) || a.name.localeCompare(b.name));
}
// Brought over from the Chrome Web Store (so they stay up to date); one that isn't there (an Edge or Opera add-on, or
// one installed by hand) is copied as it is.
async function importFrom(keys) {
  const all = new Map(); for (const [browser, ud] of CHROMIUMS) for (const prof of profilesOf(ud)) {
    let ids = []; try { ids = fs.readdirSync(path.join(prof, 'Extensions')).filter((d) => ID.test(d)); } catch {}
    for (const id of ids) if (!all.has(id)) { const dir = newestVersionDir(path.join(prof, 'Extensions', id)); if (dir) all.set(id, dir); }
  }
  const items = importable(); const results = [];
  for (const key of keys || []) {
    const it = items.find((x) => x.key === key); if (!it || !it.chromeId || it.installed) { results.push({ key, ok: !!(it && it.installed), skipped: true }); continue; }
    let ok = false, how = 'store';
    try { await store.installExtension(it.chromeId, { session: ses, extensionsPath: path.join(app.getPath('userData'), 'Extensions') }); ok = !!ses.extensions.getExtension(it.chromeId); } catch (e) { console.error('[extensions] store install', it.chromeId, e.message); }
    if (!ok && all.has(it.chromeId)) {   // not in the store: copy it
      try {
        const to = path.join(localDir(), it.chromeId);
        fs.mkdirSync(localDir(), { recursive: true }); fs.rmSync(to, { recursive: true, force: true });
        fs.cpSync(all.get(it.chromeId), to, { recursive: true, filter: (src) => !/[\\/]_metadata[\\/]computed_hashes\.json$/.test(src) });
        await ses.extensions.loadExtension(to); ok = true; how = 'copy';
      } catch (e) { console.error('[extensions] copy', it.chromeId, e.message); }
    }
    results.push({ key, name: it.name, ok, how });
  }
  return { results, list: list() };
}

module.exports = { setup, tabCreated, storeStatus, installFromStore, addTab, selectTab, contextMenuItems, list, setOn, remove, importable, importFrom, get session() { return ses; } };
