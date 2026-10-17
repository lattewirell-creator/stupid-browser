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
  $('tabSleep').value = String(s.tabSleep == null ? 15 : s.tabSleep); $('tabSleep').onchange = () => set({ tabSleep: +$('tabSleep').value });
  for (const k of ['modernLook', 'verticalTabs', 'compactMode']) { $(k).checked = k === 'modernLook' ? s[k] !== false : !!s[k]; $(k).onchange = () => set({ [k]: $(k).checked }); }
  call('profiles:picker').then((p) => { $('profilePicker').checked = p.on; }).catch(() => {});
  $('profilePicker').onchange = () => call('profiles:picker', $('profilePicker').checked);
  paintLogo(s);
  $('musicIsland').checked = s.musicIsland !== false; $('musicIsland').onchange = (e) => set({ musicIsland: e.target.checked });
  $('showBookmarksBar').checked = s.showBookmarksBar !== false; $('showBookmarksBar').onchange = (e) => set({ showBookmarksBar: e.target.checked });
  $('showHome').checked = s.showHome !== false; $('showHome').onchange = (e) => set({ showHome: e.target.checked });
  $('showSidebar').checked = s.showSidebar !== false; $('showSidebar').onchange = (e) => set({ showSidebar: e.target.checked });
  $('name').value = s.name || ''; $('name').onchange = () => set({ name: $('name').value.trim() });
  // customize
  const PRESETS = [
    ['Calm', { theme: 'light', accent: 'clay', frameTint: 'soft', corners: 'rounded', tabStyle: 'classic', uiFont: 'inter' }, '#F4EFE6', '#D97757'],
    ['Midnight', { theme: 'dark', accent: 'sky', frameTint: 'strong', corners: 'rounded', tabStyle: 'pills', uiFont: 'inter' }, '#1D2230', '#5B87B5'],
    ['Forest', { theme: 'dark', accent: 'sage', frameTint: 'soft', corners: 'round', tabStyle: 'classic', uiFont: 'rounded' }, '#1F2620', '#6F9161'],
    ['Ocean', { theme: 'light', accent: '#2E8FA8', frameTint: 'strong', corners: 'round', tabStyle: 'pills', uiFont: 'system' }, '#E6F1F3', '#2E8FA8'],
    ['Sakura', { theme: 'light', accent: '#D9779A', frameTint: 'strong', corners: 'round', tabStyle: 'pills', uiFont: 'rounded' }, '#FBEFF2', '#D9779A'],
    ['Paper', { theme: 'light', accent: 'ink', frameTint: 'none', corners: 'sharp', tabStyle: 'minimal', uiFont: 'serif' }, '#FAF8F3', '#5A5548']
  ];
  const pr = $('presets'); pr.innerHTML = '';
  for (const [name, patch, bg, fg] of PRESETS) {
    const b = el('button', 'preset'); b.style.setProperty('--pbg', bg); b.style.setProperty('--pfg', fg); if (patch.theme === 'dark') b.style.color = '#EEE9E0';
    b.append(el('span', 'preset-dot'), el('span', null, name)); b.onclick = () => set(patch).then(render); pr.appendChild(b);
  }
  $('accentPick').value = /^#[0-9a-f]{6}$/i.test(s.accent || '') ? s.accent : (ACCENTS[s.accent] || ACCENTS.clay);
  $('accentPick').oninput = () => set({ accent: $('accentPick').value.toLowerCase() });
  const DEF = { uiFont: 'inter', density: 'comfortable', corners: 'rounded', tabStyle: 'classic', frameTint: 'soft' };
  for (const k of Object.keys(DEF)) document.querySelectorAll('#' + k + ' button').forEach((b) => { b.classList.toggle('on', (s[k] || DEF[k]) === b.dataset.v); b.onclick = () => set({ [k]: b.dataset.v }).then(render); });
  const tb = $('toolbarBtns'); tb.innerHTML = '';
  for (const [k, label] of [['shield', 'Ad blocker'], ['pip', 'Picture-in-picture'], ['ai', 'AI'], ['grid', 'Apps'], ['profile', 'Profile']]) {
    const hidden = (s.hideButtons || []).includes(k);
    const c = el('button', 'chip' + (hidden ? '' : ' on'), label);
    c.onclick = () => { const h = new Set(s.hideButtons || []); hidden ? h.delete(k) : h.add(k); set({ hideButtons: [...h] }).then(render); };
    tb.appendChild(c);
  }
  $('clock24').checked = s.clock24 ?? !/[ap]m/i.test(new Date(2020, 0, 1, 15).toLocaleTimeString()); $('clock24').onchange = () => set({ clock24: $('clock24').checked });
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
  if ($('engine').options.length < Object.keys(s.engines || {}).length + 1) {
    $('engine').replaceChildren(...Object.entries(s.engines || {}).map(([k, v]) => { const o = el('option', null, v.name); o.value = k; return o; }));
    const c = el('option', null, 'Custom…'); c.value = 'custom'; $('engine').appendChild(c);
  }
  $('engine').value = s.search || 'duckduckgo'; $('engine').onchange = () => set({ search: $('engine').value }).then(render);
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

$('pwImport').onclick = async () => {
  const r = await call('import:passwords');
  if (!r.ok) { if (r.error !== 'canceled') toast(r.error); return; }
  toast(`Imported ${r.added} password${r.added === 1 ? '' : 's'}${r.skipped ? ` (${r.skipped} skipped)` : ''} — now delete ${r.file}, it holds your passwords in plain text`);
  renderPasswords();
};

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

/* ---------- browser logo (+ optional app icon) ---------- */
function paintLogo(s) {
  const kind = s.logo || 'ring', pv = $('logoPrev');
  pv.className = 'logo-prev ' + kind; pv.textContent = kind === 'emoji' ? (s.logoEmoji || '🦆') : ''; pv.style.backgroundImage = kind === 'image' && s.logoImage ? `url("${s.logoImage}")` : '';
  $('logoKind').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === kind));
  $('logoEmojiIn').classList.toggle('hidden', kind !== 'emoji'); $('logoUpload').classList.toggle('hidden', kind !== 'image');
  if (document.activeElement !== $('logoEmojiIn')) $('logoEmojiIn').value = s.logoEmoji || '';
  if (document.activeElement !== $('wordmarkIn')) $('wordmarkIn').value = s.wordmark || '';
  $('appIcon').checked = !!s.appIcon;
}
// Draws the app icon (macOS-style rounded square) from the current logo.
async function iconFor(s) {
  if (!s.appIcon || !['emoji', 'image'].includes(s.logo) || (s.logo === 'image' && !s.logoImage)) return '';
  const n = 512, c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d');
  const r = 112, p = 32; g.beginPath(); g.roundRect(p, p, n - 2 * p, n - 2 * p, r); g.closePath(); g.save(); g.clip();
  const acc = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#D97757';
  if (s.logo === 'image') { const im = new Image(); im.src = s.logoImage; await im.decode().catch(() => {}); g.drawImage(im, p, p, n - 2 * p, n - 2 * p); }
  else { const gr = g.createLinearGradient(0, p, 0, n - p); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, acc + '33'); g.fillStyle = gr; g.fillRect(0, 0, n, n); g.font = '300px "Apple Color Emoji","Segoe UI Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s.logoEmoji || '🦆', n / 2, n / 2 + 18); }
  g.restore(); return c.toDataURL('image/png');
}
async function saveLogo(patch) { const s = await call('settings:set', patch); const icon = await iconFor(s); if ((s.appIconImage || '') !== icon) await call('settings:set', { appIconImage: icon }); paintLogo(await call('settings:get')); }
$('logoKind').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.v === 'image') call('settings:get').then((s) => { if (!s.logoImage) $('logoFile').click(); }); saveLogo({ logo: b.dataset.v }); });
let emojiT; $('logoEmojiIn').addEventListener('input', () => { clearTimeout(emojiT); emojiT = setTimeout(() => { const v = $('logoEmojiIn').value.trim(); if (v) saveLogo({ logo: 'emoji', logoEmoji: v }); }, 300); });
// macOS: write the name + logo into the app bundle itself
call('brand:status').then((b) => {
  if (!b || !b.supported) return;
  $('brandRow').classList.remove('hidden');
  $('brandReset').classList.toggle('hidden', !b.custom);
  if (b.custom) $('brandHint').textContent = `The app is called “${b.name}” in Finder now. Apply again after changing the name or logo, or reset to the original.`;
  const go = (reset) => { $('brandApply').disabled = $('brandReset').disabled = true; $('brandApply').textContent = 'Restarting…'; call('brand:apply', reset).catch((e) => { $('brandApply').disabled = $('brandReset').disabled = false; $('brandApply').textContent = 'Apply & restart'; alert(String(e && e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); }); };
  $('brandApply').onclick = () => go(false); $('brandReset').onclick = () => go(true);
}).catch(() => {});
let wmT; $('wordmarkIn').addEventListener('input', () => { clearTimeout(wmT); wmT = setTimeout(() => call('settings:set', { wordmark: $('wordmarkIn').value.trim() }), 300); });
$('appIcon').addEventListener('change', () => saveLogo({ appIcon: $('appIcon').checked }));
$('logoFile').addEventListener('change', () => {
  const f = $('logoFile').files[0]; $('logoFile').value = ''; if (!f || !/^image\//.test(f.type)) return;
  const im = new Image(); const url = URL.createObjectURL(f);
  im.onload = () => { const n = 256, c = document.createElement('canvas'); c.width = c.height = n; const sq = Math.min(im.width, im.height); c.getContext('2d').drawImage(im, (im.width - sq) / 2, (im.height - sq) / 2, sq, sq, 0, 0, n, n); URL.revokeObjectURL(url); saveLogo({ logo: 'image', logoImage: c.toDataURL('image/png') }); };
  im.onerror = () => { URL.revokeObjectURL(url); toast('Couldn’t read that image'); };
  im.src = url;
});

async function renderBuddy() {
  const s = await call('settings:get'); const st = await call('buddy:status');
  $('buddyOn').checked = st.enabled;
  $('aiButton').value = s.aiButton || 'buddy';
  $('aiButton').querySelector('[value="buddy"]').disabled = !st.enabled;
  $('buddySetup').classList.toggle('dim', !st.enabled);
  if ($('buddyProvider').options.length !== Object.keys(st.providers).length) $('buddyProvider').replaceChildren(...Object.entries(st.providers).map(([k, v]) => { const o = el('option', null, v.name); o.value = k; return o; }));
  $('buddyProvider').value = st.provider;
  const P = st.providers[st.provider];
  $('buddyBaseRow').classList.toggle('hidden', !['custom', 'ollama'].includes(st.provider));
  if (document.activeElement !== $('buddyBase')) $('buddyBase').value = st.base || '';
  $('buddyBaseHint').textContent = st.provider === 'ollama' ? 'Usually http://localhost:11434/v1' : 'The service’s OpenAI-compatible API address';
  $('buddyKeyRow').classList.toggle('hidden', P.key === false);
  $('buddyKeyName').textContent = P.key === 'optional' ? 'API key (if needed)' : 'API key';
  $('buddyKeyHint').textContent = `Get one at ${P.keyUrl}. Stored encrypted on this computer and only sent to this AI.`;
  $('buddyKey').placeholder = P.hasKey ? '•••••••••• saved — paste a new key to replace' : 'Paste your API key';
  $('buddyKeyClear').classList.toggle('hidden', !P.hasKey);
  if (P.key === false) $('buddyKeyHint').textContent = P.keyUrl;
  $('buddyModelHint').textContent = st.provider === 'anthropic' ? 'Smarter models answer better; faster ones cost less' : 'Pick one of the models this AI offers (models that can see images work best)';
  if (document.activeElement !== $('buddyModel')) $('buddyModel').value = st.model || '';
  $('buddyModelLoad').classList.toggle('hidden', st.provider === 'anthropic');
  const list = $('buddyModelList');
  if (st.provider === 'anthropic') list.replaceChildren(...Object.entries(st.claudeModels).map(([k, v]) => { const o = el('option', null, v); o.value = k; return o; }));
  else if (list.dataset.for !== st.provider) { list.replaceChildren(); list.dataset.for = ''; if (P.key !== true || P.hasKey) loadModels(true); }
  $('buddyState').textContent = !st.enabled ? 'Buddy is off.' : st.ready ? `✓ Ready — Buddy uses ${st.providerName} · ${st.modelName}` : (P.key === true && !P.hasKey ? 'Add an API key to wake Buddy up.' : !st.model ? 'Pick a model to finish setting up.' : 'Almost there…');
}
async function saveBuddy(patch) {
  const s = await call('settings:get'); const b = Object.assign({}, s.buddy);
  if (patch.model !== undefined) { b.models = Object.assign({}, b.models, { [b.provider || 'anthropic']: patch.model }); delete patch.model; }
  if (patch.base !== undefined) { b.bases = Object.assign({}, b.bases, { [b.provider]: patch.base }); delete patch.base; }
  await call('settings:set', { buddy: Object.assign(b, patch) });
  renderBuddy();
}
async function loadModels(quiet) {
  const prov = $('buddyProvider').value; const list = $('buddyModelList');
  $('buddyModelLoad').disabled = true;
  const r = await call('buddy:models', prov).catch(() => ({ ok: false, error: 'Couldn’t load models.' }));
  $('buddyModelLoad').disabled = false;
  if (!r.ok) { if (!quiet) toast(r.error); return; }
  list.replaceChildren(...r.models.map((m) => { const o = el('option'); o.value = m; return o; })); list.dataset.for = prov;
  if (!quiet) toast(`${r.models.length} models available — click the Model box to pick`);
  if (!$('buddyModel').value && r.models.length) { $('buddyModel').value = r.models[0]; saveBuddy({ model: r.models[0] }); }
}
$('buddyOn').onchange = async () => {
  const on = $('buddyOn').checked; const s = await call('settings:get');
  if (!on && s.aiButton === 'buddy') await call('settings:set', { aiButton: 'sidebar' });
  if (on && s.aiButton === 'sidebar') await call('settings:set', { aiButton: 'buddy' });
  saveBuddy({ enabled: on }); toast(on ? 'AI buddy is on' : 'AI buddy is off');
};
$('aiButton').onchange = () => call('settings:set', { aiButton: $('aiButton').value });
$('buddyProvider').onchange = () => { $('buddyModelList').dataset.for = ''; $('buddyModel').value = ''; saveBuddy({ provider: $('buddyProvider').value }); };
$('buddyBase').onchange = () => { const v = $('buddyBase').value.trim(); if (v && !/^https?:\/\//i.test(v)) { toast('The address should start with http:// or https://'); return; } saveBuddy({ base: v }); };
$('buddyModel').onchange = () => { const v = $('buddyModel').value.trim(); if (v && !/^[\w.:\/@+-]{1,120}$/.test(v)) { toast('That model name has odd characters'); return; } saveBuddy({ model: v }); };
$('buddyModelLoad').onclick = () => loadModels(false);
$('buddyKeySave').onclick = async () => {
  const r = await call('buddy:setKey', $('buddyProvider').value, $('buddyKey').value);
  if (!r.ok) { toast(r.error); return; }
  $('buddyKey').value = ''; $('buddyModelList').dataset.for = ''; toast('Saved — press the AI button to talk to Buddy');
  await renderBuddy(); call('settings:set', {});   // nudges open windows to refresh Buddy
};
$('buddyKeyClear').onclick = async () => { await call('buddy:setKey', $('buddyProvider').value, ''); toast('Key removed'); renderBuddy(); call('settings:set', {}); };

$('showWelcome').onclick = () => { location.href = 'stupid://welcome/'; };

async function renderAbout() {
  const a = await call('about:info');
  $('ver').textContent = `Version ${a.version} · Chromium ${a.chrome} · Electron ${a.electron} · ${a.platform}`;
  $('udata').textContent = a.userData;
}
function renderUpdate(u) {
  if (!u) return;
  const when = u.lastCheck ? ' · checked ' + new Date(u.lastCheck).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const msg = {
    manual: 'To get automatic updates, move The Stupid Browser into your Applications folder (drag it there from the disk image), then reopen it.',
    unsupported: IS_MAC ? 'Automatic updates work in the installed app.' : u.portable ? 'You’re using the portable version, which can’t update itself. Download the new installer (StupidBrowser-Setup.exe) to get automatic updates.' : 'Automatic updates only work in the installed Windows version.',
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
  $('updBtn').disabled = u.status === 'unsupported' || u.status === 'manual' || u.status === 'checking' || u.status === 'downloading';
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
  render(); renderPerms(); renderPasswords(); renderBots(); renderSide(); renderDefault(); renderAbout(); renderBuddy();
  highlightNav();
  if (location.hash) { const t = document.querySelector(location.hash); if (t) setTimeout(() => t.scrollIntoView(), 50); }
})();
S.on('settings:changed', (n) => { s = n; render(); });
S.on('perms:changed', renderPerms);
S.on('passwords:changed', renderPasswords);
S.on('bots:changed', renderBots);
S.on('sidebar:changed', renderSide);

/* import from another browser */
const IMP_COLORS = { chrome: '#4285F4', edge: '#0F7BC4', brave: '#E2582C', arc: '#E3435D', vivaldi: '#D93B3B', opera: '#D32635', operagx: '#C2185B', chromium: '#5B87B5', firefox: '#E66000', zen: '#6F6A63', librewolf: '#3A6FB0', safari: '#1C8FE6' };
async function renderImport() {
  const box = $('importSources');
  let list = []; try { list = await call('import:sources'); } catch {}
  if (!list.length) { box.replaceChildren(el('div', 'row muted', 'No other browsers found on this computer. You can still import a bookmarks file below.')); return; }
  box.replaceChildren(...list.map((src) => {
    const row = el('div', 'row imp-row');
    const badge = el('span', 'imp-badge', src.name.replace(/^(Google|Microsoft) /, '')[0]); badge.style.background = IMP_COLORS[src.browser] || 'var(--accent)';
    const title = src.name + (src.profile ? ` · ${src.profile}` : '');
    const bits = [src.account, src.needsAccess ? '' : `${src.count} bookmark${src.count === 1 ? '' : 's'}`, src.history ? 'history' : ''].filter(Boolean);
    const lbl = el('div', 'lbl', title); lbl.appendChild(el('small', null, src.needsAccess ? 'macOS needs your permission first: turn on The Stupid Browser under Full Disk Access, then restart it.' : bits.join(' · ')));
    row.append(badge, lbl);
    if (src.needsAccess) {
      const b = el('button', 'btn small', 'Allow access…'); b.onclick = () => call('import:safariAccess');
      const again = el('button', 'btn small', 'Check again'); again.onclick = renderImport;
      row.append(b, again); return row;
    }
    const what = el('div', 'imp-what'); const boxes = {};
    for (const [k, t, on] of [['bookmarks', 'Bookmarks', src.count > 0], ['history', 'History', src.history]]) {
      const l = el('label'); const c = el('input'); c.type = 'checkbox'; c.checked = on; c.disabled = !on; boxes[k] = c; l.append(c, document.createTextNode(t)); what.appendChild(l);
    }
    const go = el('button', 'btn small primary', 'Import');
    let shown = what;   // the checkboxes, then the result of the last import
    const sync = () => { go.disabled = !boxes.bookmarks.checked && !boxes.history.checked; };
    boxes.bookmarks.onchange = boxes.history.onchange = sync; sync();
    go.onclick = async () => {
      go.disabled = true; go.textContent = 'Importing…';
      const r = await call('import:browser', src.id, { bookmarks: boxes.bookmarks.checked, history: boxes.history.checked });
      if (!r.ok) { toast(r.error); go.textContent = 'Import'; go.disabled = false; return; }
      const parts = [boxes.bookmarks.checked ? `${r.added} new bookmark${r.added === 1 ? '' : 's'}` : '', boxes.history.checked ? `${r.history} history entr${r.history === 1 ? 'y' : 'ies'}` : ''].filter(Boolean);
      const msg = el('span', 'imp-done', '✓ ' + parts.join(' and ')); shown.replaceWith(msg); shown = msg;
      go.textContent = 'Import again'; go.classList.remove('primary'); go.disabled = false;
    };
    row.append(what, go); return row;
  }));
}
$('importHtml').onclick = async () => {
  const r = await call('import:file');
  if (r.ok) toast(`Added ${r.added} bookmark${r.added === 1 ? '' : 's'} from the file`); else if (r.error !== 'canceled') toast(r.error);
};
renderImport();
