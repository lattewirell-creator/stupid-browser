'use strict';
let s = {};
const set = (patch) => call('settings:set', patch).then((n) => { s = n; });
const PERM_KINDS = [['camera', 'Camera'], ['microphone', 'Microphone'], ['location', 'Location'], ['notifications', 'Notifications']];

function bindToggle(id) { const e = $(id); e.checked = s[id] !== false && !!(s[id] ?? true); e.onchange = () => set({ [id]: e.checked }); }
function bindValue(id, key = id) { const e = $(id); e.value = s[key] ?? ''; e.onchange = () => set({ [key]: e.value }); }

function render() {
  // appearance
  document.querySelectorAll('#theme button').forEach((b) => { b.classList.toggle('on', (s.theme || 'system') === b.dataset.v); b.onclick = () => set({ theme: b.dataset.v }).then(render); });
  const acc = $('accent'); acc.innerHTML = '';
  for (const [k, c] of Object.entries(ACCENTS)) { const b = el('button', 'swatch' + ((s.accent || 'clay') === k ? ' on' : '')); b.style.background = c; b.title = k; b.onclick = () => set({ accent: k }).then(render); acc.appendChild(b); }
  bindValue('fontSize');
  $('showBookmarksBar').checked = s.showBookmarksBar !== false; $('showBookmarksBar').onchange = (e) => set({ showBookmarksBar: e.target.checked });
  $('showHome').checked = s.showHome !== false; $('showHome').onchange = (e) => set({ showHome: e.target.checked });
  $('showSidebar').checked = s.showSidebar !== false; $('showSidebar').onchange = (e) => set({ showSidebar: e.target.checked });
  $('name').value = s.name || ''; $('name').onchange = () => set({ name: $('name').value.trim() });
  // startup
  document.querySelectorAll('input[name="startup"]').forEach((r) => { r.checked = r.value === (s.startup || 'continue'); r.onchange = () => set({ startup: r.value }).then(render); });
  $('pagesBox').classList.toggle('hidden', s.startup !== 'pages');
  const pages = $('pages'); pages.innerHTML = '';
  (s.startupPages || []).forEach((u, i) => {
    const r = el('div', 'row list-row'); r.append(favImg(u), el('span', 'ellipsis', u));
    const x = el('button', 'icon-btn'); x.title = 'Remove'; x.appendChild(icon(X_ICON)); x.onclick = () => { const p = [...s.startupPages]; p.splice(i, 1); set({ startupPages: p }).then(render); };
    r.appendChild(x); pages.appendChild(r);
  });
  // search
  $('engine').value = s.search || 'google'; $('engine').onchange = () => set({ search: $('engine').value }).then(render);
  $('customRow').classList.toggle('hidden', s.search !== 'custom');
  $('customSearch').value = s.customSearch || '';
  $('customSearch').onchange = () => { const v = $('customSearch').value.trim(); if (v && (!/^https?:\/\//.test(v) || !v.includes('%s'))) { toast('Use a full https:// address with %s in it'); return; } set({ customSearch: v }).then(() => toast('Saved')); };
  // privacy
  $('adblock').checked = !!s.adblock; $('adblock').onchange = (e) => call('adblock:set', e.target.checked);
  $('dnt').checked = !!s.dnt; $('dnt').onchange = (e) => set({ dnt: e.target.checked });
  // passwords / downloads
  $('savePasswords').checked = s.savePasswords !== false; $('savePasswords').onchange = (e) => set({ savePasswords: e.target.checked });
  $('dlDir').textContent = s.downloadDir || '';
  $('askWhereToSave').checked = !!s.askWhereToSave; $('askWhereToSave').onchange = (e) => set({ askWhereToSave: e.target.checked });
}

$('pageForm').onsubmit = (e) => {
  e.preventDefault();
  let u = $('pageUrl').value.trim(); if (!u) return;
  if (!/^(https?|stupid):\/\//.test(u)) u = 'https://' + u;
  set({ startupPages: [...(s.startupPages || []), u] }).then(() => { $('pageUrl').value = ''; render(); });
};

$('clearBtn').onclick = async () => {
  const opts = { range: +$('range').value, history: $('cHistory').checked, downloads: $('cDownloads').checked, cookies: $('cCookies').checked, cache: $('cCache').checked };
  if (!opts.history && !opts.downloads && !opts.cookies && !opts.cache) { toast('Pick something to clear'); return; }
  $('clearBtn').disabled = true; $('clearBtn').textContent = 'Clearing…';
  try { await call('privacy:clear', opts); toast('Browsing data cleared'); } catch { toast('Could not clear everything'); }
  $('clearBtn').disabled = false; $('clearBtn').textContent = 'Clear data';
};

async function renderPerms() {
  const perms = await call('perms:get');
  const box = $('perms'); box.innerHTML = '';
  const origins = Object.keys(perms).sort();
  if (!origins.length) { box.appendChild(el('div', 'row muted', 'No site permissions yet. When a site asks for your camera, microphone, location or notifications, your answer shows up here.')); return; }
  const head = el('div', 'perm-grid head'); head.appendChild(el('span', null, 'Site')); for (const [, l] of PERM_KINDS) head.appendChild(el('span', null, l)); head.appendChild(el('span')); box.appendChild(head);
  for (const o of origins) {
    const r = el('div', 'perm-grid');
    const name = el('span', 'ellipsis', o.replace(/^https?:\/\//, '')); name.title = o; r.appendChild(name);
    for (const [k] of PERM_KINDS) {
      const sel = el('select', 'input');
      for (const [v, t] of [['ask', 'Ask'], ['allow', 'Allow'], ['block', 'Block']]) { const op = el('option', null, t); op.value = v; sel.appendChild(op); }
      sel.value = perms[o][k] || 'ask';
      sel.onchange = () => call('perms:set', o, k, sel.value);
      r.appendChild(sel);
    }
    const x = el('button', 'icon-btn'); x.title = 'Reset this site'; x.appendChild(icon(X_ICON));
    x.onclick = async () => { for (const [k] of PERM_KINDS) await call('perms:set', o, k, 'ask'); renderPerms(); };
    r.appendChild(x); box.appendChild(r);
  }
}

const IS_MAC = S.platform === 'darwin';
if (IS_MAC) $('defHint').textContent = 'macOS asks you to confirm. Choose “Use The Stupid Browser”.';

async function renderPasswords() {
  const enc = await call('pw:encryption');
  $('encNote').textContent = enc ? (IS_MAC ? 'Passwords are encrypted with a key kept in your macOS Keychain and stay on this computer.' : 'Passwords are encrypted with your Windows account (DPAPI) and stay on this computer.') : 'Warning: system encryption is not available, passwords are only obfuscated.';
  const list = await call('pw:list');
  const box = $('pwList'); box.innerHTML = '';
  if (!list.length) { box.appendChild(el('div', 'row muted', 'No saved passwords. When you sign in to a site, The Stupid Browser offers to save it.')); return; }
  for (const p of list.sort((a, b) => a.origin.localeCompare(b.origin))) {
    const r = el('div', 'row list-row');
    r.appendChild(favImg(p.origin));
    const site = el('span', 'ellipsis', p.origin.replace(/^https?:\/\//, '')); site.style.flex = '1';
    r.appendChild(site);
    if (p.never) { r.appendChild(el('span', 'muted', 'Never saved')); }
    else {
      r.appendChild(el('span', 'ellipsis', p.username || '(no username)')).style.width = '180px';
      const pw = el('span', 'pw', '••••••••'); pw.style.width = '140px'; r.appendChild(pw);
      const show = el('button', 'btn small', 'Show');
      show.onclick = async () => { if (show.textContent === 'Show') { pw.textContent = await call('pw:reveal', p.id); show.textContent = 'Hide'; } else { pw.textContent = '••••••••'; show.textContent = 'Show'; } };
      const copy = el('button', 'btn small', 'Copy');
      copy.onclick = async () => { await navigator.clipboard.writeText(await call('pw:reveal', p.id)); toast('Password copied'); };
      r.append(show, copy);
    }
    const x = el('button', 'icon-btn'); x.title = 'Delete'; x.appendChild(icon(X_ICON));
    x.onclick = async () => { if (!confirm(`Delete the saved password for ${p.origin}?`)) return; await call('pw:delete', p.id); renderPasswords(); };
    r.appendChild(x); box.appendChild(r);
  }
}

$('dlChange').onclick = async () => { const d = await call('downloads:chooseDir'); if (d) { s.downloadDir = d; render(); } };

let bots = [];
async function renderBots() {
  bots = await call('bots:get');
  const sel = $('defaultBot'); sel.innerHTML = '';
  for (const b of bots) { const o = el('option', null, b.name); o.value = b.url; sel.appendChild(o); }
  sel.value = bots.some((b) => b.url === s.defaultBot) ? s.defaultBot : (bots[0] && bots[0].url);
  sel.onchange = () => set({ defaultBot: sel.value });
  const box = $('botList'); box.innerHTML = '';
  bots.forEach((b, i) => {
    const r = el('div', 'row list-row'); r.appendChild(favImg(b.url));
    r.appendChild(el('span', null, b.name)).style.width = '140px';
    r.appendChild(el('span', 'ellipsis muted', b.url));
    const up = el('button', 'icon-btn'); up.title = 'Move up'; up.appendChild(icon('<path d="M6 15l6-6 6 6"/>')); up.disabled = i === 0;
    up.onclick = () => { bots.splice(i - 1, 0, bots.splice(i, 1)[0]); call('bots:set', bots).then(renderBots); };
    const x = el('button', 'icon-btn'); x.title = 'Remove'; x.appendChild(icon(X_ICON));
    x.onclick = () => { if (bots.length === 1) { toast('Keep at least one AI'); return; } bots.splice(i, 1); call('bots:set', bots).then(renderBots); };
    r.append(up, x); box.appendChild(r);
  });
}
$('botForm').onsubmit = (e) => {
  e.preventDefault();
  const name = $('botName').value.trim(); let url = $('botUrl').value.trim();
  if (!name || !url) { toast('Add a name and a URL'); return; }
  if (!/^https?:\/\//.test(url)) url = 'https://' + url;
  try { new URL(url); } catch { toast('That URL does not look right'); return; }
  bots.push({ name, url, custom: true }); call('bots:set', bots).then(() => { $('botName').value = ''; $('botUrl').value = ''; renderBots(); });
};
$('botReset').onclick = async () => { await call('bots:set', await call('bots:defaults')); renderBots(); };

let side = [];
async function renderSide() {
  side = await call('sidebar:get');
  const box = $('sideList'); box.innerHTML = '';
  if (!side.length) box.appendChild(el('div', 'row muted', 'No apps in the sidebar.'));
  side.forEach((it, i) => {
    const r = el('div', 'row list-row'); r.appendChild(favImg(it.url));
    r.appendChild(el('span', null, it.name)).style.width = '140px';
    r.appendChild(el('span', 'ellipsis muted', it.url));
    const up = el('button', 'icon-btn'); up.title = 'Move up'; up.appendChild(icon('<path d="M6 15l6-6 6 6"/>')); up.disabled = i === 0;
    up.onclick = () => { side.splice(i - 1, 0, side.splice(i, 1)[0]); call('sidebar:set', side).then(renderSide); };
    const x = el('button', 'icon-btn'); x.title = 'Remove'; x.appendChild(icon(X_ICON));
    x.onclick = () => { side.splice(i, 1); call('sidebar:set', side).then(renderSide); };
    r.append(up, x); box.appendChild(r);
  });
}
$('sideForm').onsubmit = (e) => {
  e.preventDefault();
  const name = $('sideName').value.trim(); let url = $('sideUrl').value.trim();
  if (!name || !url) { toast('Add a name and a URL'); return; }
  if (!/^https?:\/\//.test(url)) url = 'https://' + url;
  try { new URL(url); } catch { toast('That URL does not look right'); return; }
  side.push({ id: 'c' + Date.now().toString(36), name, url }); call('sidebar:set', side).then(() => { $('sideName').value = ''; $('sideUrl').value = ''; renderSide(); });
};
$('sideReset').onclick = async () => { await call('sidebar:set', await call('sidebar:defaults')); renderSide(); };

async function renderDefault() {
  const st = await call('default:status');
  const isDef = st.http && st.https;
  $('defStatus').firstChild.textContent = isDef ? 'The Stupid Browser is registered for web links. ' : 'The Stupid Browser is not your default browser. ';
}
$('defBtn').onclick = async () => { await call('default:set'); toast(IS_MAC ? 'Confirm in the macOS dialog that opened' : 'Choose The Stupid Browser in the Windows window that opened'); setTimeout(renderDefault, 1500); };

async function renderAbout() {
  const a = await call('about:info');
  $('ver').textContent = `Version ${a.version} · Chromium ${a.chrome} · Electron ${a.electron} · ${a.platform}`;
  $('udata').textContent = a.userData;
}
function renderUpdate(u) {
  if (!u) return;
  const when = u.lastCheck ? ' · checked ' + new Date(u.lastCheck).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const msg = {
    unsupported: IS_MAC ? 'Automatic updates aren’t available on macOS yet. Download the latest .dmg from GitHub Releases to update.' : u.portable ? 'You’re using the portable version, which can’t update itself. Download the new installer (StupidBrowser-Setup.exe) to get automatic updates.' : 'Automatic updates only work in the installed Windows version.',
    idle: `Version ${u.current}. Updates are checked automatically every few hours.`,
    checking: 'Checking for updates…',
    none: `You’re up to date (version ${u.current})${when}.`,
    downloading: `Downloading version ${u.version || ''}… ${u.progress || 0}%`,
    ready: `Version ${u.version} is ready. Restart to finish updating (or it installs when you close the browser).`,
    error: `Couldn’t check for updates: ${u.error || 'unknown error'}${when}.`
  }[u.status] || '';
  $('updNote').textContent = msg;
  $('updBar').classList.toggle('hidden', u.status !== 'downloading');
  $('updBar').firstElementChild.style.width = (u.progress || 0) + '%';
  $('updInstall').classList.toggle('hidden', u.status !== 'ready');
  $('updBtn').disabled = u.status === 'unsupported' || u.status === 'checking' || u.status === 'downloading';
}
$('updBtn').onclick = async () => renderUpdate(await call('update:check'));
$('updInstall').onclick = () => call('update:install');
S.on('update:status', renderUpdate);
call('update:status').then(renderUpdate);
$('resetAll').onclick = async () => { if (!confirm('Reset all settings to their defaults? Bookmarks, history and passwords are kept.')) return; s = await call('settings:reset'); render(); toast('Settings reset'); };

// nav highlight + search filter
function highlightNav() {
  let cur = 'appearance';
  for (const sec of document.querySelectorAll('section')) if (sec.getBoundingClientRect().top < 140) cur = sec.id === 'clear' ? 'privacy' : sec.id;
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + cur));
}
addEventListener('scroll', highlightNav, { passive: true });
$('filter').oninput = () => {
  const q = $('filter').value.trim().toLowerCase();
  for (const sec of document.querySelectorAll('main section')) sec.classList.toggle('dim', !!q && !sec.textContent.toLowerCase().includes(q));
  if (q) { const hit = [...document.querySelectorAll('main section')].find((x) => !x.classList.contains('dim')); if (hit) hit.scrollIntoView({ behavior: 'smooth' }); }
};

(async () => {
  s = await call('settings:get');
  render(); renderPerms(); renderPasswords(); renderBots(); renderSide(); renderDefault(); renderAbout();
  highlightNav();
  if (location.hash) { const t = document.querySelector(location.hash); if (t) setTimeout(() => t.scrollIntoView(), 50); }
})();
S.on('settings:changed', (n) => { s = n; render(); });
S.on('perms:changed', renderPerms);
S.on('passwords:changed', renderPasswords);
S.on('bots:changed', renderBots);
S.on('sidebar:changed', renderSide);
