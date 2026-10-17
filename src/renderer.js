'use strict';
/* The Stupid Browser — browser UI (vanilla JS, no frameworks). */
const api = window.stupid;
const $ = (id) => document.getElementById(id);
const call = (ch, ...a) => api.invoke(ch, ...a);

const NEWTAB = 'stupid://newtab/';
const ACCENTS = { clay: '#D97757', sand: '#C9963F', sage: '#6F9161', sky: '#5B87B5', plum: '#9A6390', rose: '#C8606F', ink: '#5A5548' };
const GROUP_COLORS = { clay: '#D97757', sand: '#C9A15A', sage: '#7C9A6E', sky: '#6A8FB5', plum: '#9B6A8E', rose: '#C96A7A', teal: '#5E9A94', slate: '#8A857A', ink: '#3D3929' };
const ZOOMS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
const INTERNAL_TITLES = { newtab: 'New tab', settings: 'Settings', history: 'History', downloads: 'Downloads', bookmarks: 'Bookmarks', source: 'Page source', welcome: 'Welcome' };

let info = {};
let settings = {};
let bookmarks = [];
let bots = [];
let sideItems = [];
let tabs = [];              // ordered; pinned first, group members kept together
let groups = new Map();     // id -> { id, name, color, collapsed }
let activeId = null;
let split = null;
let nextId = 1;
let restoring = false;
const closedStack = [];

/* ---------------- helpers ---------------- */
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function svg(inner, cls) { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); if (cls) s.setAttribute('class', cls); s.innerHTML = inner; return s; }
const ICON = {
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  speaker: '<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>',
  muted: '<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16 9l5 6M21 9l-5 6"/>',
  globe: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.5 2.5 2.5 13.5 0 16M12 4c-2.5 2.5-2.5 13.5 0 16"/>',
  folder: '<path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  star: '<path d="M12 4l2.4 5 5.6.6-4.2 3.8 1.2 5.6L12 16.2 7 19l1.2-5.6L4 9.6 9.6 9z"/>',
  tab: '<rect x="4" y="6" width="16" height="12" rx="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>'
};
let toastTimer;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 2400); }
const isInternal = (u) => /^stupid:\/\//.test(u || '');
const isNewtab = (u) => !u || /^stupid:\/\/newtab\/?(\?.*)?$/.test(u);
const displayUrl = (u) => (isNewtab(u) ? '' : u);
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const internalName = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
const tabById = (id) => tabs.find((t) => t.id === id);
const activeTab = () => tabById(activeId);
const faviconFor = (url) => { const h = hostOf(url); return h ? `https://www.google.com/s2/favicons?sz=64&domain=${h}` : null; };
function searchUrl(q) { return (settings.searchUrl || 'https://duckduckgo.com/?q=%s').replace('%s', encodeURIComponent(q)); }
function engineName() { return settings.search === 'custom' ? 'custom search' : ((settings.engines || {})[settings.search] || { name: 'DuckDuckGo' }).name; }
// Community / site searches: "!r how to…" → your engine limited to Reddit, etc.
const SCOPES = [
  { key: 'reddit', bang: ['r', 'reddit'], name: 'Reddit', site: 'reddit.com' },
  { key: 'quora', bang: ['q', 'quora'], name: 'Quora', site: 'quora.com' },
  { key: 'so', bang: ['so', 'stackoverflow'], name: 'Stack Overflow', site: 'stackoverflow.com' },
  { key: 'yt', bang: ['yt', 'youtube'], name: 'YouTube', url: 'https://www.youtube.com/results?search_query=%s' },
  { key: 'w', bang: ['w', 'wiki'], name: 'Wikipedia', url: 'https://en.wikipedia.org/w/index.php?search=%s' }
];
const scopeUrl = (sc, q) => (sc.url ? sc.url.replace('%s', encodeURIComponent(q)) : searchUrl(`${q} site:${sc.site}`));
function toUrl(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const bang = /^!(\w+)\s+(.+)$/.exec(t);
  if (bang) { const sc = SCOPES.find((x) => x.bang.includes(bang[1].toLowerCase())); if (sc) return scopeUrl(sc, bang[2]); }
  if (/^(https?|file|stupid|about|view-source):/i.test(t)) return t;
  if (/^localhost(:\d+)?(\/.*)?$/i.test(t) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(t)) return 'http://' + t;
  if (!/\s/.test(t) && /^[^\s/]+\.[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(t)) return 'https://' + t;
  return searchUrl(t);
}
function prettyTitle(tab) {
  if (isInternal(tab.url) && (!tab.title || tab.title === tab.url)) return INTERNAL_TITLES[internalName(tab.url)] || 'Page';
  return tab.title || displayUrl(tab.url) || 'New tab';
}

/* ---------------- webviews ---------------- */
function createWebview(tab) {
  const wv = document.createElement('webview');
  wv.setAttribute('partition', info.partition);
  wv.setAttribute('allowpopups', '');
  wv.setAttribute('src', tab.url);
  wv.dataset.tab = tab.id;
  tab.internal = isInternal(tab.url);
  tab.wv = wv; tab.ready = false;
  wv.addEventListener('did-start-loading', () => { tab.loading = true; tab.crashed = false; renderTab(tab); if (tab.id === activeId) updateNav(); });
  wv.addEventListener('did-stop-loading', () => { tab.loading = false; renderTab(tab); if (tab.id === activeId) updateNav(); scheduleSave(); });
  wv.addEventListener('dom-ready', () => { tab.ready = true; tab.wcId = wv.getWebContentsId(); if (tab.muted) wv.setAudioMuted(true); readZoom(tab); if (tab.id === activeId) updateNav(); });
  wv.addEventListener('page-title-updated', (e) => { tab.title = e.title; renderTab(tab); if (tab.id === activeId) updateNav(); scheduleSave(); });
  wv.addEventListener('page-favicon-updated', (e) => { tab.favicon = (e.favicons || []).find((f) => /^(https?|data):/.test(f)) || null; renderTab(tab); scheduleSave(); });
  const onNav = (e) => {
    if (e.isMainFrame === false) return;
    tab.url = e.url;
    if (isInternal(tab.url)) tab.favicon = null;
    renderTab(tab); readZoom(tab);
    if (tab.id === activeId) { updateNav(); closeFind(); }
    scheduleSave();
  };
  wv.addEventListener('did-navigate', onNav);
  wv.addEventListener('did-navigate-in-page', onNav);
  wv.addEventListener('focus', () => { if (split && split.includes(tab.id) && activeId !== tab.id) { activeId = tab.id; renderAll(); } closeSuggest(); hideAllPops(); });
  wv.addEventListener('did-fail-load', (e) => { if (e.isMainFrame && e.errorCode !== -3) { tab.title = "Can't reach this page"; tab.loadError = e.errorDescription; renderTab(tab); } });
  wv.addEventListener('render-process-gone', () => { tab.crashed = true; tab.loading = false; tab.title = 'This tab crashed — reload'; renderTab(tab); });
  wv.addEventListener('found-in-page', (e) => { if (tab.id === activeId) $('findCount').textContent = `${e.result.activeMatchOrdinal || 0}/${e.result.matches || 0}`; });
  wv.addEventListener('enter-html-full-screen', () => document.body.classList.add('htmlfs'));
  wv.addEventListener('leave-html-full-screen', () => document.body.classList.remove('htmlfs'));
  wv.addEventListener('update-target-url', (e) => showStatus(e.url));
  $('views').appendChild(wv);
}
function rebuildWebview(tab, url) {
  if (tab.wv) tab.wv.remove();
  tab.wv = null; tab.url = url;
  createWebview(tab);
  renderAll();
}
let statusEl;
function showStatus(url) {
  if (!statusEl) { statusEl = el('div', 'status-url'); $('content').appendChild(statusEl); }
  statusEl.textContent = url || '';
  statusEl.classList.toggle('show', !!url);
}

/* ---------------- tab model ---------------- */
function normalizeOrder() {
  const pinned = tabs.filter((t) => t.pinned);
  const rest = tabs.filter((t) => !t.pinned);
  const out = []; const seen = new Set();
  for (const t of rest) {
    if (!t.groupId || !groups.has(t.groupId)) { t.groupId = null; out.push(t); continue; }
    if (seen.has(t.groupId)) continue;
    seen.add(t.groupId);
    out.push(...rest.filter((x) => x.groupId === t.groupId));
  }
  if (!restoring) for (const g of [...groups.keys()]) if (!tabs.some((t) => t.groupId === g)) groups.delete(g);
  pinned.forEach((t) => (t.groupId = null));
  tabs = [...pinned, ...out];
}

// A blank new tab is kept ready (hidden) so opening one is instant, like Chrome's prerendered new tab page.
let spareTab = null, spareT = null;
function makeSpare() {
  clearTimeout(spareT);
  if (spareTab || restoring) return;
  spareTab = { id: nextId++, url: NEWTAB, title: '', favicon: null, pinned: false, groupId: null, wv: null, loading: false, muted: false, audible: false, zoom: 1, lastActive: Date.now() };
  createWebview(spareTab);
}
const queueSpare = () => { clearTimeout(spareT); spareT = setTimeout(makeSpare, 1200); };
function newTab(url, opts = {}) {
  const { activate = true, pinned = false, title, favicon, lazy = false, groupId = null, index = null, muted = false, afterId = null } = opts;
  let tab;
  if (!lazy && (url || NEWTAB) === NEWTAB && spareTab && spareTab.ready && !spareTab.crashed) {
    tab = spareTab; spareTab = null;
    Object.assign(tab, { pinned, groupId, muted, lastActive: Date.now(), title: title || tab.title });
    if (muted) try { tab.wv.setAudioMuted(true); } catch {}
    tab.wv.classList.add('fresh'); setTimeout(() => tab.wv && tab.wv.classList.remove('fresh'), 400);
    queueSpare();
  } else tab = { id: nextId++, url: url || NEWTAB, title: title || '', favicon: favicon || null, pinned, groupId, wv: null, loading: false, muted, audible: false, zoom: 1, lastActive: Date.now() };
  if (index != null) tabs.splice(Math.min(index, tabs.length), 0, tab);
  else if (afterId != null) {
    // Chrome-like: links open right after the opener (and its other children)
    let i = tabs.findIndex((t) => t.id === afterId);
    const opener = tabs[i];
    while (i + 1 < tabs.length && tabs[i + 1].openerId === afterId) i++;
    tabs.splice(i + 1, 0, tab);
    tab.openerId = afterId;
    if (opener && opener.groupId) tab.groupId = opener.groupId;
  } else tabs.push(tab);
  normalizeOrder();
  if (!lazy && !tab.wv) { createWebview(tab); if (tab.url === NEWTAB) { tab.wv.classList.add('fresh'); setTimeout(() => tab.wv && tab.wv.classList.remove('fresh'), 400); queueSpare(); } }
  buildTabEl(tab);
  if (activate) activate_(tab.id); else renderAll();
  scheduleSave();
  return tab;
}

function activate_(id) {
  const tab = tabById(id);
  if (!tab) return;
  if (split && !split.includes(id)) split = null;
  if (tab.groupId && groups.get(tab.groupId) && groups.get(tab.groupId).collapsed) groups.get(tab.groupId).collapsed = false;
  const changed = activeId !== id;
  const prev = changed && tabById(activeId); if (prev) prev.lastActive = Date.now();   // "last seen", for tab sleeping
  activeId = id;
  tab.lastActive = Date.now();
  if (changed && tab.wv && !split) { tab.wv.classList.remove('switch-in'); void tab.wv.offsetWidth; tab.wv.classList.add('switch-in'); }
  if (!tab.wv) { tab.asleep = false; createWebview(tab); }
  renderAll();
  if (changed) { closeFind(); hideAllPops(); showQueuedPrompt(); }
  if (isNewtab(tab.url)) setTimeout(() => { $('address').focus(); }, 30);
  else setTimeout(() => { try { tab.wv.focus(); } catch {} }, 0);
  scheduleSave();
}

function closeTab(id, { record = true } = {}) {
  const i = tabs.findIndex((t) => t.id === id);
  if (i < 0) return;
  const tab = tabs[i];
  if (record && !isNewtab(tab.url)) {
    closedStack.push({ url: tab.url, title: tab.title, favicon: tab.favicon, index: i, groupId: tab.groupId, pinned: tab.pinned });
    if (closedStack.length > 25) closedStack.shift();
  }
  tabs.splice(i, 1);
  if (tab.wv) tab.wv.remove();
  if (tab.el) {   // shrink away instead of vanishing
    const e = tab.el; e.classList.remove('entering', 'active'); e.classList.add('leaving');
    const gone = () => e.remove(); e.addEventListener('animationend', gone, { once: true }); setTimeout(gone, 260);
  }
  if (split && split.includes(id)) split = null;
  normalizeOrder();
  if (!tabs.length) { if (info.incognito || settings.closeWindowWithLastTab) { call('win:close'); return; } newTab(); return; }
  if (activeId === id) {
    // Chrome picks the tab to the right, else the left one (opener first if it opened this one)
    const opener = tab.openerId && tabById(tab.openerId);
    const next = opener && opener !== tabs[i] ? opener : tabs[Math.min(i, tabs.length - 1)];
    activate_(next.id);
  } else renderAll();
  scheduleSave();
}
function reopenClosed() {
  const c = closedStack.pop();
  if (!c) { toast('No recently closed tabs'); return; }
  newTab(c.url, { title: c.title, favicon: c.favicon, index: c.index, pinned: c.pinned, groupId: c.groupId && groups.has(c.groupId) ? c.groupId : null });
}
function closeOthers(tab) { for (const t of tabs.filter((x) => x.id !== tab.id && !x.pinned)) closeTab(t.id); activate_(tab.id); }
function closeRight(tab) { const i = tabs.indexOf(tab); for (const t of tabs.slice(i + 1)) closeTab(t.id); }
function togglePin(tab) { tab.pinned = !tab.pinned; tab.groupId = null; normalizeOrder(); renderAll(); scheduleSave(); }
function toggleMute(tab) {
  tab.muted = !tab.muted;
  if (tab.wv && tab.ready) tab.wv.setAudioMuted(tab.muted);
  renderTab(tab); scheduleSave();
}

/* ---------------- groups ---------------- */
let groupSeq = 1;
function newGroup(tabList, name = '') {
  const used = new Set([...groups.values()].map((g) => g.color));
  const color = Object.keys(GROUP_COLORS).find((c) => !used.has(c)) || 'clay';
  const id = 'g' + Date.now().toString(36) + (groupSeq++);
  groups.set(id, { id, name, color, collapsed: false });
  for (const t of tabList) { t.pinned = false; t.groupId = id; }
  normalizeOrder(); renderAll(); scheduleSave();
  setTimeout(() => editGroup(id), 50);
  return id;
}
function addToGroup(tab, gid) { tab.pinned = false; tab.groupId = gid; normalizeOrder(); renderAll(); scheduleSave(); }
function ungroup(gid) { for (const t of tabs) if (t.groupId === gid) t.groupId = null; groups.delete(gid); normalizeOrder(); renderAll(); scheduleSave(); }
function closeGroup(gid) { for (const t of tabs.filter((x) => x.groupId === gid)) closeTab(t.id); groups.delete(gid); renderAll(); scheduleSave(); }
function toggleCollapse(gid) {
  const g = groups.get(gid); if (!g) return;
  g.collapsed = !g.collapsed;
  if (g.collapsed && activeTab() && activeTab().groupId === gid) {
    const other = tabs.find((t) => t.groupId !== gid && !(t.groupId && groups.get(t.groupId).collapsed));
    if (other) activate_(other.id); else newTab();
  }
  renderAll(); scheduleSave();
}
function editGroup(gid) {
  const g = groups.get(gid); if (!g) return;
  const chip = document.querySelector(`.group-chip[data-gid="${gid}"]`); if (!chip) return;
  const r = chip.getBoundingClientRect();
  const pop = $('popover'); pop.innerHTML = ''; pop.className = 'pop group-pop';
  const input = el('input', 'text-in'); input.placeholder = 'Name this group'; input.value = g.name; input.maxLength = 40;
  input.addEventListener('input', () => { g.name = input.value; renderAll(); scheduleSave(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') hidePop(); });
  pop.appendChild(input);
  const sw = el('div', 'swatches');
  for (const [k, c] of Object.entries(GROUP_COLORS)) {
    const b = el('button', 'swatch' + (g.color === k ? ' on' : '')); b.style.background = c; b.title = k;
    b.addEventListener('click', () => { g.color = k; renderAll(); scheduleSave(); [...sw.children].forEach((x) => x.classList.toggle('on', x === b)); });
    sw.appendChild(b);
  }
  pop.appendChild(sw);
  const actions = [
    ['New tab in group', () => { const last = [...tabs].reverse().find((t) => t.groupId === gid); newTab(null, { afterId: last && last.id }); const t = activeTab(); if (t) addToGroup(t, gid); }],
    [g.collapsed ? 'Expand group' : 'Collapse group', () => toggleCollapse(gid)],
    ['Ungroup', () => ungroup(gid)],
    ['Close group', () => closeGroup(gid)]
  ];
  for (const [label, fn] of actions) { const b = el('button', 'menu-item', label); b.addEventListener('click', () => { hidePop(); fn(); }); pop.appendChild(b); }
  showPopAt(pop, r.left, r.bottom + 6);
  input.focus(); input.select();
}

/* ---------------- tab strip ---------------- */
let dragId = null;
function buildTabEl(tab) {
  const e = el('div', 'tab' + (restoring ? '' : ' entering'));   // grows into place (not on session restore)
  e.addEventListener('animationend', (ev) => { if (ev.animationName === 'tabGrow') e.classList.remove('entering'); });
  e.dataset.id = tab.id;
  e.draggable = true;
  e.appendChild(el('span', 'fav-dot'));
  e.appendChild(el('span', 'title'));
  const au = el('button', 'audio hidden'); au.title = 'Mute tab';
  au.addEventListener('mousedown', (ev) => ev.stopPropagation());
  au.addEventListener('click', (ev) => { ev.stopPropagation(); toggleMute(tab); });
  e.appendChild(au);
  const c = el('button', 'close'); c.title = keyLabel('Close tab (Ctrl+W)'); c.appendChild(svg(ICON.x));
  c.addEventListener('mousedown', (ev) => ev.stopPropagation());
  c.addEventListener('click', (ev) => { ev.stopPropagation(); closeTab(tab.id); });
  e.appendChild(c);
  e.addEventListener('mousedown', (ev) => { if (ev.button === 0) activate_(tab.id); if (ev.button === 1) ev.preventDefault(); });
  e.addEventListener('auxclick', (ev) => { if (ev.button === 1) { ev.preventDefault(); closeTab(tab.id); } });
  e.addEventListener('dblclick', (ev) => ev.stopPropagation());
  e.addEventListener('contextmenu', (ev) => { ev.preventDefault(); tabMenu(tab, ev.clientX, ev.clientY); });
  e.addEventListener('mouseenter', () => hoverCard(tab, e));
  e.addEventListener('mouseleave', hideHoverCard);
  // drag to reorder
  e.addEventListener('dragstart', (ev) => { dragId = tab.id; e.classList.add('dragging'); ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', tab.url); hideHoverCard(); });
  e.addEventListener('dragend', () => { dragId = null; e.classList.remove('dragging'); clearDropMarks(); });
  e.addEventListener('dragover', (ev) => {
    if (dragId == null || dragId === tab.id) return;
    ev.preventDefault();
    const r = e.getBoundingClientRect();
    const after = ev.clientX > r.left + r.width / 2;
    clearDropMarks(); e.classList.add(after ? 'drop-after' : 'drop-before');
  });
  e.addEventListener('drop', (ev) => {
    ev.preventDefault();
    const src = tabById(dragId); if (!src || src === tab) return;
    const r = e.getBoundingClientRect();
    const after = ev.clientX > r.left + r.width / 2;
    moveTab(src, tab, after);
  });
  tab.el = e;
  renderTab(tab);
}
function clearDropMarks() { document.querySelectorAll('.drop-before,.drop-after').forEach((x) => x.classList.remove('drop-before', 'drop-after')); }
function moveTab(src, target, after) {
  tabs.splice(tabs.indexOf(src), 1);
  let i = tabs.indexOf(target) + (after ? 1 : 0);
  src.pinned = target.pinned;
  // Dropping between two members of a group joins it; at a group's edge the tab keeps its own
  // membership only if it already belongs to that group. Dropping on a group chip always joins.
  const left = tabs[i - 1], right = tabs[i];
  const g = target.groupId;
  const inside = g && left && right && left.groupId === g && right.groupId === g;
  const edge = g && ((left && left.groupId === g) || (right && right.groupId === g));
  if (inside || (edge && src.groupId === g)) src.groupId = g;
  else src.groupId = null;
  tabs.splice(i, 0, src);
  normalizeOrder(); renderAll(); scheduleSave();
}

function renderTab(tab) {
  const e = tab.el; if (!e) return;
  e.classList.toggle('active', tab.id === activeId);
  e.classList.toggle('pinned', tab.pinned);
  e.classList.toggle('loading', !!tab.loading);
  e.classList.toggle('sleeping', !tab.wv);
  e.classList.toggle('crashed', !!tab.crashed);
  e.classList.toggle('split', !!(split && split.includes(tab.id)));
  e.classList.toggle('asleep', !!tab.asleep && !tab.wv);
  if (tab.asleep && !tab.wv) e.title = (tab.title || tab.url) + ' — sleeping to save memory'; else if (e.title.endsWith(' — sleeping to save memory')) e.title = tab.title || tab.url;
  e.classList.toggle('grouped', !!tab.groupId);
  const g = tab.groupId && groups.get(tab.groupId);
  e.style.setProperty('--gc', g ? GROUP_COLORS[g.color] : 'transparent');
  e.querySelector('.title').textContent = prettyTitle(tab);
  // favicon / spinner
  let fav = e.querySelector('.fav');
  const favUrl = tab.favicon || (!isInternal(tab.url) && !tab.wv ? faviconFor(tab.url) : null);
  if (favUrl && !tab.loading) {
    if (!fav) { fav = el('img', 'fav'); fav.draggable = false; fav.addEventListener('error', () => { tab.favicon = null; tab.favFailed = true; fav.replaceWith(el('span', 'fav-dot')); }); e.querySelector('.fav-dot').replaceWith(fav); }
    if (fav.getAttribute('src') !== favUrl && !tab.favFailed) fav.src = favUrl;
  } else if (fav) fav.replaceWith(el('span', 'fav-dot'));
  const dot = e.querySelector('.fav-dot');
  if (dot) dot.classList.toggle('internal', isInternal(tab.url));
  // audio indicator
  const au = e.querySelector('.audio');
  const showAudio = tab.audible || tab.muted;
  au.classList.toggle('hidden', !showAudio);
  if (showAudio) { au.innerHTML = ''; au.appendChild(svg(tab.muted ? ICON.muted : ICON.speaker)); au.title = tab.muted ? 'Unmute tab' : 'Mute tab'; au.classList.toggle('muted', tab.muted); }
}

function renderStrip() {
  const pinBox = $('pinnedTabs'), box = $('tabs');
  const frag = document.createDocumentFragment();
  const pinFrag = document.createDocumentFragment();
  let lastGroup = null;
  const want = [], wantPinned = [];
  for (const t of tabs) {
    if (t.pinned) { wantPinned.push(t.el); t.el.classList.remove('collapsed-hide'); continue; }
    if (t.groupId && t.groupId !== lastGroup) want.push(groupChip(groups.get(t.groupId)));
    lastGroup = t.groupId;
    const g = t.groupId && groups.get(t.groupId);
    t.el.classList.toggle('collapsed-hide', !!(g && g.collapsed));
    const nextT = tabs[tabs.indexOf(t) + 1];
    t.el.classList.toggle('group-end', !!t.groupId && (!nextT || nextT.groupId !== t.groupId));
    want.push(t.el);
  }
  // Only touch the DOM when the order really changed: re-inserting a tab restarts its animations (flicker on every switch).
  const sync = (container, nodes) => {
    const current = [...container.children].filter((c) => !c.classList.contains('leaving'));
    const same = current.length === nodes.length && current.every((c, k) => c === nodes[k] || (c.classList.contains('group-chip') && nodes[k].classList.contains('group-chip') && c.dataset.gid === nodes[k].dataset.gid));
    if (same) { current.forEach((c, k) => { if (c !== nodes[k]) c.replaceWith(nodes[k]); }); return; }
    container.querySelectorAll('.group-chip').forEach((c) => c.remove());
    nodes.forEach((n) => { if (n.classList.contains('group-chip')) frag.appendChild(n); else frag.appendChild(n); });
    container.appendChild(frag);
  };
  sync(box, want); sync(pinBox, wantPinned);
  void pinFrag;
  // stretch: tabs shrink like Chrome
  const n = tabs.filter((t) => !t.pinned && !(t.groupId && groups.get(t.groupId).collapsed)).length;
  box.style.setProperty('--n', n);
}
function groupChip(g) {
  const c = el('button', 'group-chip' + (g.collapsed ? ' collapsed' : ''));
  c.dataset.gid = g.id;
  c.style.setProperty('--gc', GROUP_COLORS[g.color]);
  c.textContent = g.name || '';
  if (!g.name) c.classList.add('unnamed');
  const count = tabs.filter((t) => t.groupId === g.id).length;
  c.title = `${g.name || 'Unnamed group'} — ${count} tab${count === 1 ? '' : 's'} (click to ${g.collapsed ? 'expand' : 'collapse'}, right-click to edit)`;
  if (g.collapsed) c.appendChild(el('span', 'gcount', String(count)));
  c.addEventListener('click', () => toggleCollapse(g.id));
  c.addEventListener('contextmenu', (e) => { e.preventDefault(); editGroup(g.id); });
  c.addEventListener('dragover', (ev) => { if (dragId != null) { ev.preventDefault(); c.classList.add('drop-into'); } });
  c.addEventListener('dragleave', () => c.classList.remove('drop-into'));
  c.addEventListener('drop', (ev) => { ev.preventDefault(); c.classList.remove('drop-into'); const t = tabById(dragId); if (t) { t.groupId = g.id; t.pinned = false; const first = tabs.find((x) => x.groupId === g.id && x !== t); if (first) { tabs.splice(tabs.indexOf(t), 1); tabs.splice(tabs.indexOf(first), 0, t); } normalizeOrder(); renderAll(); scheduleSave(); } });
  return c;
}

let hcTimer;
function hoverCard(tab, anchor) {
  clearTimeout(hcTimer);
  hcTimer = setTimeout(() => {
    if (dragId != null) return;
    const card = $('hoverCard');
    card.querySelector('.hc-title').textContent = prettyTitle(tab);
    card.querySelector('.hc-url').textContent = isInternal(tab.url) ? 'The Stupid Browser' : (hostOf(tab.url) || tab.url) + (tab.wv ? '' : ' · sleeping') + (tab.muted ? ' · muted' : '');
    const r = anchor.getBoundingClientRect();
    card.style.left = Math.max(6, Math.min(r.left, innerWidth - 300)) + 'px';
    card.style.top = r.bottom + 6 + 'px';
    card.classList.remove('hidden');
  }, 450);
}
function hideHoverCard() { clearTimeout(hcTimer); $('hoverCard').classList.add('hidden'); }

function renderAll() {
  const visible = split ? split : [activeId];
  $('views').classList.toggle('split', !!split);
  for (const t of tabs) {
    renderTab(t);
    if (t.wv) {
      t.wv.classList.toggle('visible', visible.includes(t.id));
      t.wv.classList.toggle('focused', !!split && t.id === activeId);
      t.wv.style.order = split ? String(split.indexOf(t.id)) : '';
    }
  }
  renderStrip();
  updateNav();
}

/* ---------------- toolbar state ---------------- */
function updateNav() {
  const tab = activeTab(); if (!tab) return;
  const wv = tab.wv;
  let back = false, fwd = false;
  if (wv && tab.ready) { try { back = wv.canGoBack(); fwd = wv.canGoForward(); } catch {} }
  $('backBtn').disabled = !back; $('fwdBtn').disabled = !fwd;
  $('reloadBtn').classList.toggle('loading', !!tab.loading);
  $('reloadBtn').title = tab.loading ? 'Stop loading' : keyLabel('Reload (Ctrl+R)');
  if (document.activeElement !== $('address')) $('address').value = displayUrl(tab.url);
  const sb = $('siteBtn');
  const state = isNewtab(tab.url) ? 'search' : isInternal(tab.url) ? 'info' : /^https:/.test(tab.url) ? 'lock' : /^http:/.test(tab.url) ? 'warn' : 'info';
  sb.dataset.state = state;
  sb.title = { search: 'Search', info: 'View site information', lock: 'Connection is secure — view site information', warn: 'Not secure — view site information' }[state];
  $('starBtn').classList.toggle('on', bookmarks.some((b) => b.type === 'bookmark' && b.url === tab.url));
  $('starBtn').classList.toggle('hidden', isNewtab(tab.url));
  const z = tab.zoom || 1;
  $('zoomBtn').classList.toggle('hidden', Math.abs(z - 1) < 0.001);
  $('zoomBtn').textContent = Math.round(z * 100) + '%';
  document.title = (!isNewtab(tab.url) ? prettyTitle(tab) + ' — ' : '') + (info.incognito ? 'Private — ' : '') + 'The Stupid Browser';
}

function navigate(text, tab = activeTab()) {
  const url = toUrl(text);
  if (!url || !tab) return;
  closeSuggest();
  // webviews created for an internal page carry the (protocol-gated) internal bridge; web-only ones need a rebuild to show internal pages
  if (!tab.wv || (isInternal(url) && !tab.internal)) { rebuildWebview(tab, url); }
  else { tab.url = url; tab.wv.loadURL(url).catch(() => {}); }
  renderAll();
  setTimeout(() => { try { if (!isNewtab(url)) tab.wv.focus(); } catch {} }, 0);
}
function openUrl(url, where = 'foreground', opener = null) {
  const cur = activeTab();
  if (where === 'current' && cur) return navigate(url, cur);
  const openerTab = opener ? tabs.find((t) => t.wcId === opener) : null;
  if (where === 'foreground' && cur && isNewtab(cur.url) && !cur.loading && !openerTab) return navigate(url, cur);
  newTab(url, { activate: where !== 'background', afterId: openerTab ? openerTab.id : (where === 'background' && cur ? cur.id : null) });
}
function openInternal(name) {
  const url = `stupid://${name}/`;
  const existing = tabs.find((t) => t.url.startsWith(url));
  if (existing) { activate_(existing.id); return; }
  const cur = activeTab();
  if (cur && isNewtab(cur.url)) navigate(url, cur); else newTab(url);
}

/* ---------------- zoom ---------------- */
function readZoom(tab) {
  if (!tab.wv || !tab.ready) return;
  try { tab.zoom = tab.wv.getZoomFactor(); } catch { tab.zoom = 1; }
  if (tab.id === activeId) updateNav();
}
function zoom(dir) {
  const tab = activeTab(); if (!tab || !tab.wv || !tab.ready) return;
  const cur = tab.wv.getZoomFactor();
  let next = 1;
  if (dir > 0) next = ZOOMS.find((z) => z > cur + 0.001) || ZOOMS[ZOOMS.length - 1];
  else if (dir < 0) next = [...ZOOMS].reverse().find((z) => z < cur - 0.001) || ZOOMS[0];
  tab.wv.setZoomFactor(next);
  // same-site tabs share zoom in Chromium; refresh them
  for (const t of tabs) if (t.wv && t.ready && hostOf(t.url) === hostOf(tab.url)) setTimeout(() => readZoom(t), 60);
  tab.zoom = next; updateNav();
  toast('Zoom ' + Math.round(next * 100) + '%');
}

/* ---------------- find in page ---------------- */
function openFind() {
  const tab = activeTab(); if (!tab || !tab.wv) return;
  $('findBar').classList.remove('hidden');
  $('findInput').focus(); $('findInput').select();
  if ($('findInput').value) find(true);
}
function find(forward, next = false) {
  const tab = activeTab(); const q = $('findInput').value;
  if (!tab || !tab.wv || !tab.ready) return;
  if (!q) { tab.wv.stopFindInPage('clearSelection'); $('findCount').textContent = '0/0'; return; }
  tab.wv.findInPage(q, { forward, findNext: !next ? true : false });
}
function closeFind() {
  if ($('findBar').classList.contains('hidden')) return;
  $('findBar').classList.add('hidden');
  for (const t of tabs) if (t.wv && t.ready) { try { t.wv.stopFindInPage('keepSelection'); } catch {} }
}
$('findInput').addEventListener('input', () => find(true));
$('findInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); find(!e.shiftKey, true); }
  if (e.key === 'Escape') { e.preventDefault(); closeFind(); const t = activeTab(); if (t && t.wv) t.wv.focus(); }
});
$('findNext').addEventListener('click', () => find(true, true));
$('findPrev').addEventListener('click', () => find(false, true));
$('findClose').addEventListener('click', closeFind);

/* ---------------- split view ---------------- */
function toggleSplit(withId) {
  if (split && !withId) { split = null; renderAll(); toast('Split view off'); return; }
  const cur = activeTab(); if (!cur) return;
  let other = withId ? tabById(withId) : [...tabs].filter((t) => t.id !== cur.id).sort((a, b) => b.lastActive - a.lastActive)[0];
  if (!other) other = newTab(null, { activate: false });
  if (!other.wv) createWebview(other);
  split = [cur.id, other.id];
  renderAll();
  toast(keyLabel('Split view on — Ctrl+Shift+S to exit'));
}

/* ---------------- popovers & menus ---------------- */
function showPopAt(pop, x, y) {
  pop.classList.remove('hidden');
  const r = pop.getBoundingClientRect();
  pop.style.left = Math.max(6, Math.min(x, innerWidth - r.width - 8)) + 'px';
  pop.style.top = Math.max(6, Math.min(y, innerHeight - r.height - 8)) + 'px';
}
// Sticky popovers (permission prompts, save-password offers) stay until answered, like Chrome's bubbles.
function hidePop(force = false) { const p = $('popover'); if (p.classList.contains('sticky') && !force) return; p.classList.remove('sticky'); p.classList.add('hidden'); }
function hideMenus() { $('menu').classList.add('hidden'); $('ctxMenu').classList.add('hidden'); }
function hideAllPops() { hidePop(); hideMenus(); }
function showMenu(target, items, x, y) {
  const m = $(target); m.innerHTML = '';
  for (const it of items) {
    if (!it) continue;
    if (it === '-') { m.appendChild(el('div', 'sep')); continue; }
    if (it.row) { m.appendChild(it.row); continue; }
    const b = el('button', 'menu-item');
    b.appendChild(el('span', 'ml', it.label));
    if (it.key) b.appendChild(el('span', 'mk', keyLabel(it.key)));
    if (it.disabled) b.disabled = true;
    b.addEventListener('click', () => { hideMenus(); it.fn(); });
    m.appendChild(b);
  }
  showPopAt(m, x, y);
}
document.addEventListener('mousedown', (e) => {
  if (!$('ctxMenu').contains(e.target) && !$('menu').contains(e.target) && e.target.id !== 'menuBtn' && !$('menuBtn').contains(e.target)) hideMenus();
  if (!$('popover').contains(e.target) && !e.target.closest('#siteBtn,#starBtn,#dlBtn,.group-chip,.rail-add,#gridBtn,#profileBtn,#soundBtn') && !$('popover').classList.contains('sticky')) hidePop();
  if (!$('omnibox').contains(e.target)) closeSuggest();
});
addEventListener('blur', () => { hideMenus(); hideHoverCard(); });

function tabMenu(tab, x, y) {
  const i = tabs.indexOf(tab);
  const otherGroups = [...groups.values()].filter((g) => g.id !== tab.groupId);
  const items = [
    { label: 'New tab to the right', fn: () => newTab(null, { index: i + 1, groupId: tab.groupId }) },
    tab.groupId ? { label: 'Remove from group', fn: () => { tab.groupId = null; tabs.splice(tabs.indexOf(tab), 1); const last = [...tabs].reverse().find((t) => !t.pinned); tabs.splice(last ? tabs.indexOf(last) + 1 : tabs.length, 0, tab); normalizeOrder(); renderAll(); scheduleSave(); } }
      : { label: 'Add tab to new group', fn: () => newGroup([tab]) }
  ];
  for (const g of otherGroups.slice(0, 6)) items.push({ label: `Add to group “${g.name || 'Unnamed'}”`, fn: () => addToGroup(tab, g.id) });
  items.push('-',
    { label: 'Reload', key: 'Ctrl+R', fn: () => { if (tab.wv) tab.wv.reload(); else activate_(tab.id); } },
    { label: 'Duplicate', fn: () => newTab(tab.url, { index: i + 1, groupId: tab.groupId }) },
    { label: tab.pinned ? 'Unpin' : 'Pin', fn: () => togglePin(tab) },
    { label: tab.muted ? 'Unmute site' : 'Mute site', fn: () => toggleMute(tab) },
    tab.id !== activeId ? { label: 'Split with current tab', fn: () => toggleSplit(tab.id) } : (split ? { label: 'Exit split view', fn: () => toggleSplit() } : { label: 'Split view', key: 'Ctrl+Shift+S', fn: () => toggleSplit() }),
    '-',
    tab.wv && tab.id !== activeId ? { label: 'Sleep tab (free memory)', fn: () => sleepTab(tab, true) } : null,
    { label: 'Sleep other tabs', disabled: !tabs.some((t) => t !== tab && t.wv && t.id !== activeId), fn: () => tabs.forEach((t) => { if (t !== tab) sleepTab(t, true); }) },
    { label: 'Close', key: 'Ctrl+W', fn: () => closeTab(tab.id) },
    { label: 'Close other tabs', disabled: tabs.filter((t) => !t.pinned).length < 2, fn: () => closeOthers(tab) },
    { label: 'Close tabs to the right', disabled: i === tabs.length - 1, fn: () => closeRight(tab) },
    '-',
    { label: 'Reopen closed tab', key: 'Ctrl+Shift+T', disabled: !closedStack.length, fn: reopenClosed });
  showMenu('ctxMenu', items, x, y);
}

function zoomRow() {
  const row = el('div', 'menu-row');
  row.appendChild(el('span', 'ml', 'Zoom'));
  const minus = el('button', 'mini', '−'); minus.addEventListener('click', () => { zoom(-1); lbl.textContent = Math.round((activeTab().zoom || 1) * 100) + '%'; });
  const lbl = el('span', 'zl', Math.round(((activeTab() || {}).zoom || 1) * 100) + '%');
  const plus = el('button', 'mini', '+'); plus.addEventListener('click', () => { zoom(1); lbl.textContent = Math.round((activeTab().zoom || 1) * 100) + '%'; });
  const fs = el('button', 'mini'); fs.title = 'Full screen (F11)'; fs.appendChild(svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'));
  fs.addEventListener('click', () => { hideMenus(); call('win:fullscreen'); });
  row.append(minus, lbl, plus, fs);
  return { row };
}
function themeLabel() { const m = settings.theme || 'system'; return 'Theme: ' + m[0].toUpperCase() + m.slice(1); }
function mainMenu() {
  const r = $('menuBtn').getBoundingClientRect();
  showMenu('menu', [
    { label: 'New tab', key: 'Ctrl+T', fn: () => newTab() },
    { label: 'New window', key: 'Ctrl+N', fn: () => call('win:new', {}) },
    { label: 'New private window', key: 'Ctrl+Shift+N', fn: () => call('win:new', { incognito: true }) },
    '-',
    { label: 'History', key: 'Ctrl+H', fn: () => openInternal('history') },
    { label: 'Downloads', key: 'Ctrl+J', fn: () => openInternal('downloads') },
    { label: 'Bookmarks', key: 'Ctrl+Shift+O', fn: () => openInternal('bookmarks') },
    { label: 'Reopen closed tab', key: 'Ctrl+Shift+T', disabled: !closedStack.length, fn: reopenClosed },
    '-',
    zoomRow(),
    '-',
    { label: 'Print…', key: 'Ctrl+P', fn: () => runCmd('print') },
    { label: 'Find…', key: 'Ctrl+F', fn: openFind },
    { label: 'Sound & EQ…', fn: () => openSoundPanel() },
    { label: 'Command bar', key: 'Ctrl+K', fn: () => openCmd() },
    { label: 'View page source', key: 'Ctrl+U', fn: () => runCmd('view-source') },
    { label: 'Developer tools', key: 'F12', fn: () => runCmd('devtools') },
    { label: themeLabel(), fn: cycleTheme },
    '-',
    { label: 'Settings', key: 'Ctrl+,', fn: () => openInternal('settings') },
    { label: 'Close window', key: 'Ctrl+Shift+W', fn: () => call('win:close') }
  ], r.right - 260, r.bottom + 4);
}
$('menuBtn').addEventListener('click', () => { if ($('menu').classList.contains('hidden')) mainMenu(); else hideMenus(); });
function cycleTheme() {
  const order = ['system', 'light', 'dark'];
  const m = order[(order.indexOf(settings.theme || 'system') + 1) % 3];
  call('settings:set', { theme: m }); toast('Theme: ' + m[0].toUpperCase() + m.slice(1));
}

/* ---------------- bookmarks ---------------- */
function renderBookmarks() {
  const bar = $('bookmarksBar'); bar.innerHTML = '';
  document.body.classList.toggle('no-bm', settings.showBookmarksBar === false);
  const root = bookmarks.filter((b) => !b.parentId);
  if (!root.length) bar.appendChild(el('div', 'bm-empty', keyLabel('Press ★ or Ctrl+D to bookmark a page')));
  for (const b of root) {
    const e = el('div', 'bm' + (b.type === 'folder' ? ' folder' : ''));
    e.title = b.type === 'folder' ? b.title : `${b.title}\n${b.url}`;
    if (b.type === 'folder') e.appendChild(svg(ICON.folder, 'bm-ic'));
    else {
      const src = b.favicon || faviconFor(b.url);
      if (src) { const i = el('img'); i.src = src; i.draggable = false; i.onerror = () => i.replaceWith(svg(ICON.globe, 'bm-ic')); e.appendChild(i); }
    }
    e.appendChild(el('span', null, b.title || b.url));
    e.addEventListener('click', (ev) => {
      if (b.type === 'folder') { const r = e.getBoundingClientRect(); call('bookmarks:folderMenu', b.id, r.left, r.bottom + 2); return; }
      if (ev.ctrlKey || ev.metaKey) openUrl(b.url, 'background'); else navigate(b.url);
    });
    e.addEventListener('auxclick', (ev) => { if (ev.button === 1 && b.type !== 'folder') openUrl(b.url, 'background'); });
    e.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      const items = b.type === 'folder'
        ? [{ label: 'Open all in new tabs', fn: () => bookmarks.filter((x) => x.parentId === b.id && x.type === 'bookmark').forEach((x) => openUrl(x.url, 'background')) }]
        : [{ label: 'Open in new tab', fn: () => openUrl(b.url, 'background') }, { label: 'Open in new window', fn: () => call('win:new', { url: b.url }) }, { label: 'Open in private window', fn: () => call('win:new', { incognito: true, url: b.url }) }];
      items.push('-', { label: 'Bookmark manager', fn: () => openInternal('bookmarks') }, { label: 'Delete', fn: () => saveBookmarks(bookmarks.filter((x) => x.id !== b.id && x.parentId !== b.id)) });
      showMenu('ctxMenu', items, ev.clientX, ev.clientY);
    });
    bar.appendChild(e);
  }
}
function saveBookmarks(list) { bookmarks = list; call('bookmarks:set', list); renderBookmarks(); updateNav(); }
function bookmarkPopover(bm) {
  const pop = $('popover'); pop.innerHTML = ''; pop.className = 'pop bm-pop';
  pop.appendChild(el('div', 'pop-title serif', 'Bookmark added'));
  const name = el('input', 'text-in'); name.value = bm.title || '';
  const folder = el('select', 'text-in');
  const opt = (v, t) => { const o = el('option', null, t); o.value = v; return o; };
  folder.appendChild(opt('', 'Bookmarks bar'));
  for (const f of bookmarks.filter((x) => x.type === 'folder')) folder.appendChild(opt(f.id, f.title));
  folder.value = bm.parentId || '';
  const labeled = (l, input) => { const w = el('label', 'field'); w.appendChild(el('span', null, l)); w.appendChild(input); return w; };
  pop.append(labeled('Name', name), labeled('Folder', folder));
  const row = el('div', 'pop-actions');
  const rm = el('button', 'pill', 'Remove'); const more = el('button', 'pill', 'More…'); const done = el('button', 'pill solid', 'Done');
  rm.addEventListener('click', () => { saveBookmarks(bookmarks.filter((x) => x.id !== bm.id)); hidePop(); toast('Bookmark removed'); });
  more.addEventListener('click', () => { hidePop(); openInternal('bookmarks'); });
  const commit = () => { bm.title = name.value.trim() || bm.url; bm.parentId = folder.value || null; saveBookmarks([...bookmarks]); hidePop(); };
  done.addEventListener('click', commit);
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); });
  row.append(rm, el('div', 'grow'), more, done);
  pop.appendChild(row);
  const r = $('starBtn').getBoundingClientRect();
  showPopAt(pop, r.right - 300, r.bottom + 8);
  name.focus(); name.select();
}
function toggleBookmark() {
  const tab = activeTab(); if (!tab || isNewtab(tab.url)) return;
  let bm = bookmarks.find((b) => b.type === 'bookmark' && b.url === tab.url);
  if (!bm) {
    bm = { id: 'b' + Date.now().toString(36), type: 'bookmark', title: prettyTitle(tab), url: tab.url, favicon: tab.favicon || null, parentId: null, ts: Date.now() };
    saveBookmarks([...bookmarks, bm]);
  }
  bookmarkPopover(bm);
}
$('starBtn').addEventListener('click', toggleBookmark);

/* ---------------- site info (padlock) ---------------- */
const PERM_LABEL = { camera: 'Camera', microphone: 'Microphone', location: 'Location', notifications: 'Notifications' };
async function siteInfo() {
  const tab = activeTab(); if (!tab) return;
  if (isNewtab(tab.url)) { $('address').focus(); return; }
  const pop = $('popover'); pop.innerHTML = ''; pop.className = 'pop site-pop';
  let origin = ''; try { origin = new URL(tab.url).origin; } catch {}
  const secure = /^https:/.test(tab.url);
  pop.appendChild(el('div', 'pop-title serif', isInternal(tab.url) ? 'The Stupid Browser' : hostOf(tab.url)));
  const st = el('div', 'site-state ' + (isInternal(tab.url) ? 'internal' : secure ? 'secure' : 'insecure'));
  st.textContent = isInternal(tab.url) ? 'This is a built-in page of The Stupid Browser.' : secure ? 'Connection is secure. Your info (like passwords) is private when it is sent to this site.' : 'Connection is not secure. Don’t enter passwords or card details on this site.';
  pop.appendChild(st);
  if (!isInternal(tab.url) && origin) {
    const perms = (await call('perms:get'))[origin] || {};
    pop.appendChild(el('div', 'pop-sub', 'Permissions'));
    for (const k of Object.keys(PERM_LABEL)) {
      const row = el('label', 'perm-row'); row.appendChild(el('span', null, PERM_LABEL[k]));
      const s = el('select', 'text-in small');
      for (const [v, t] of [['ask', 'Ask'], ['allow', 'Allow'], ['block', 'Block']]) { const o = el('option', null, t); o.value = v; s.appendChild(o); }
      s.value = perms[k] || 'ask';
      s.addEventListener('change', () => { call('perms:set', origin, k, s.value); toast('Reload the page to apply'); });
      row.appendChild(s); pop.appendChild(row);
    }
    const row = el('div', 'pop-actions');
    const clear = el('button', 'pill', 'Clear site data');
    clear.addEventListener('click', async () => { await call('site:clearData', origin); hidePop(); toast('Cookies and site data cleared'); if (tab.wv) tab.wv.reload(); });
    const more = el('button', 'pill', 'Site settings');
    more.addEventListener('click', () => { hidePop(); openUrlInternal('settings', '#privacy'); });
    row.append(clear, el('div', 'grow'), more); pop.appendChild(row);
  }
  const r = $('siteBtn').getBoundingClientRect();
  showPopAt(pop, r.left - 4, r.bottom + 10);
}
function openUrlInternal(name, hash = '') { const u = `stupid://${name}/${hash}`; const cur = activeTab(); if (cur && isNewtab(cur.url)) navigate(u, cur); else newTab(u); }
$('siteBtn').addEventListener('click', siteInfo);

/* ---------------- permission prompts ---------------- */
const promptQueue = [];
const KIND_TEXT = { camera: 'Use your camera', microphone: 'Use your microphone', location: 'Know your location', notifications: 'Show notifications' };
api.on('perm:prompt', (p) => { promptQueue.push(p); showQueuedPrompt(); });
function showQueuedPrompt() {
  const busy = !$('popover').classList.contains('hidden') && $('popover').classList.contains('sticky');
  if (!promptQueue.length || busy) return;
  const p = promptQueue.shift();
  const pop = $('popover'); pop.innerHTML = ''; pop.className = 'pop perm-pop sticky';
  let host = p.origin; try { host = new URL(p.origin).host; } catch {}
  pop.appendChild(el('div', 'pop-title serif', `${host} wants to`));
  for (const k of p.kinds) { const r = el('div', 'perm-ask'); r.appendChild(el('span', 'pdot')); r.appendChild(el('span', null, KIND_TEXT[k] || k)); pop.appendChild(r); }
  const row = el('div', 'pop-actions');
  const answer = (allow, remember) => { call('perm:respond', p.id, allow, remember); hidePop(true); setTimeout(showQueuedPrompt, 100); };
  const block = el('button', 'pill', 'Block'); block.addEventListener('click', () => answer(false, true));
  const once = el('button', 'pill', 'Allow this time'); once.addEventListener('click', () => answer(true, false));
  const allow = el('button', 'pill solid', 'Allow'); allow.addEventListener('click', () => answer(true, true));
  row.append(block, el('div', 'grow'), once, allow); pop.appendChild(row);
  const r = $('siteBtn').getBoundingClientRect();
  showPopAt(pop, r.left - 4, r.bottom + 10);
}

/* ---------------- password save offers ---------------- */
api.on('pw:offer', (p) => {
  if ($('popover').classList.contains('sticky') && !$('popover').classList.contains('hidden')) return;
  const pop = $('popover'); pop.innerHTML = ''; pop.className = 'pop pw-pop sticky';
  let host = p.origin; try { host = new URL(p.origin).host; } catch {}
  pop.appendChild(el('div', 'pop-title serif', p.update ? 'Update password?' : 'Save password?'));
  pop.appendChild(el('div', 'pop-text', `For ${host}` + (p.username ? ` as ${p.username}` : '')));
  pop.appendChild(el('div', 'pop-note', 'Saved passwords are encrypted on this computer. Manage them in Settings → Passwords.'));
  const row = el('div', 'pop-actions');
  const done = (a) => { call('pw:respond', p.id, a); hidePop(true); if (a === 'save') toast('Password saved'); };
  const never = el('button', 'pill', 'Never for this site'); never.addEventListener('click', () => done('never'));
  const no = el('button', 'pill', 'Not now'); no.addEventListener('click', () => done('dismiss'));
  const yes = el('button', 'pill solid', p.update ? 'Update' : 'Save'); yes.addEventListener('click', () => done('save'));
  row.append(never, el('div', 'grow'), no, yes); pop.appendChild(row);
  const r = $('starBtn').getBoundingClientRect();
  showPopAt(pop, r.right - 320, r.bottom + 8);
});

/* ---------------- downloads ---------------- */
const dls = new Map();
const fmtBytes = (n) => (n > 1e9 ? (n / 1e9).toFixed(1) + ' GB' : n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : n > 1e3 ? Math.round(n / 1e3) + ' KB' : (n || 0) + ' B');
function renderDlBtn() {
  const live = [...dls.values()].filter((d) => d.state === 'progressing');
  $('dlBtn').classList.toggle('hidden', !dls.size);
  const total = live.reduce((a, d) => a + (d.total || 0), 0), got = live.reduce((a, d) => a + (d.received || 0), 0);
  const pct = live.length && total ? Math.round((got / total) * 100) : live.length ? 15 : 0;
  $('dlRing').style.setProperty('--p', pct);
  $('dlBtn').classList.toggle('active', live.length > 0);
  if (!$('popover').classList.contains('hidden') && $('popover').classList.contains('dl-pop')) dlPopover();
}
function dlPopover() {
  const pop = $('popover'); pop.innerHTML = ''; pop.className = 'pop dl-pop';
  pop.appendChild(el('div', 'pop-title serif', 'Recent downloads'));
  for (const d of [...dls.values()].sort((a, b) => b.ts - a.ts).slice(0, 6)) {
    const row = el('div', 'dl-row');
    const name = el('div', 'dl-name', d.filename);
    const sub = el('div', 'dl-sub', d.state === 'progressing' ? `${fmtBytes(d.received)} of ${d.total ? fmtBytes(d.total) : '?'}${d.paused ? ' · paused' : ''}` : d.state === 'completed' ? fmtBytes(d.received) + ' · done' : d.state === 'cancelled' ? 'Cancelled' : 'Failed');
    const bar = el('div', 'dl-bar'); const fill = el('div'); fill.style.width = d.total ? Math.round((d.received / d.total) * 100) + '%' : '30%'; bar.appendChild(fill);
    const info = el('div', 'dl-info'); info.append(name, sub); if (d.state === 'progressing') info.appendChild(bar);
    row.appendChild(info);
    const act = (label, a) => { const b = el('button', 'pill small', label); b.addEventListener('click', () => call('downloads:action', d.id, a)); row.appendChild(b); };
    if (d.state === 'progressing') { act(d.paused ? 'Resume' : 'Pause', d.paused ? 'resume' : 'pause'); act('Cancel', 'cancel'); }
    else if (d.state === 'completed') { act('Open', 'open'); act('Folder', 'show'); }
    else act('Retry', 'retry');
    pop.appendChild(row);
  }
  const all = el('button', 'menu-item', keyLabel('Show all downloads   Ctrl+J')); all.addEventListener('click', () => { hidePop(); openInternal('downloads'); });
  pop.appendChild(all);
  const r = $('dlBtn').getBoundingClientRect();
  showPopAt(pop, r.right - 360, r.bottom + 8);
}
$('dlBtn').addEventListener('click', () => { if (!$('popover').classList.contains('hidden') && $('popover').classList.contains('dl-pop')) hidePop(); else dlPopover(); });
api.on('downloads:started', (d) => { dls.set(d.id, d); renderDlBtn(); dlPopover(); });
api.on('downloads:update', (d) => { if (dls.has(d.id) || d.state === 'progressing') { dls.set(d.id, d); renderDlBtn(); if (d.state === 'completed' && dls.get(d.id)) toast(`Downloaded ${d.filename}`); } });
api.on('downloads:removed', (id) => { dls.delete(id); renderDlBtn(); });
api.on('downloads:cleared', () => { for (const [k, d] of dls) if (d.state !== 'progressing') dls.delete(k); renderDlBtn(); });

/* ---------------- address bar autocomplete ---------------- */
let sugItems = [], sugSel = 0, typed = '', sugTimer;
function closeSuggest() { $('suggest').classList.add('hidden'); sugItems = []; }
async function updateSuggest(inline) {
  const q = $('address').value.slice(0, $('address').selectionStart === $('address').selectionEnd ? undefined : $('address').selectionStart).trim();
  typed = q;
  if (!q) { closeSuggest(); return; }
  const res = await call('history:suggest', q);
  if ($('address').value.slice(0, q.length).trim() !== q) return;
  const go = toUrl(q);
  const isSearch = go.startsWith(searchUrl('').split('?')[0]) && !/^https?:\/\//i.test(q) && go === searchUrl(q);
  sugItems = [{ kind: isSearch ? 'search' : 'url', label: isSearch ? q : go, sub: isSearch ? `${engineName()} search` : 'Open', url: go }];
  const lq = q.toLowerCase();
  for (const t of tabs) if (t.id !== activeId && !isInternal(t.url) && ((t.title || '').toLowerCase().includes(lq) || t.url.toLowerCase().includes(lq))) sugItems.push({ kind: 'tab', label: prettyTitle(t), sub: 'Switch to this tab', id: t.id, fav: t.favicon });
  for (const r of res) if (r.url !== go) sugItems.push({ kind: r.kind, label: r.title || r.url, sub: r.url.replace(/^https?:\/\/(www\.)?/, ''), url: r.url, fav: faviconFor(r.url) });
  if (isSearch && !/^!\w+\s/.test(q)) sugItems.splice(1, 0, { kind: 'scopes', label: q, sub: '' });
  const buddyOn = window.buddy && !(settings.buddy && settings.buddy.enabled === false);
  if (isSearch) sugItems.push({ kind: 'search', label: q, sub: buddyOn ? `Ask ${(settings.buddyLook && settings.buddyLook.name) || 'Buddy'}` : 'Ask Claude in the AI sidebar', ai: true, buddy: buddyOn });
  sugItems = sugItems.slice(0, 9);
  sugSel = 0;
  // inline completion (Chrome-style) from the best history/bookmark prefix match
  if (inline && res[0]) {
    const strip = res[0].url.replace(/^https?:\/\/(www\.)?/, '');
    if (strip.toLowerCase().startsWith(lq) && strip.length > q.length) {
      const input = $('address');
      input.value = q + strip.slice(q.length).replace(/\/$/, '');
      input.setSelectionRange(q.length, input.value.length);
      sugItems.unshift({ kind: res[0].kind, label: res[0].title || res[0].url, sub: strip, url: res[0].url, fav: faviconFor(res[0].url) });
      sugItems = sugItems.filter((x, i) => i === 0 || x.url !== res[0].url).slice(0, 9);
    }
  }
  renderSuggest();
}
function renderSuggest() {
  const box = $('suggest'); box.innerHTML = '';
  if (!sugItems.length) { closeSuggest(); return; }
  sugItems.forEach((it, i) => {
    if (it.kind === 'scopes') {   // one row of "search on Reddit / Quora / …" buttons
      const r = el('div', 'sug sug-scopes' + (i === sugSel ? ' sel' : ''));
      r.appendChild(el('span', 'sug-s', 'Search on'));
      for (const sc of SCOPES) {
        const b = el('button', 'scope-chip'); const im = el('img'); im.src = faviconFor(sc.url || 'https://' + sc.site); im.onerror = () => im.remove();
        b.append(im, el('span', null, sc.name)); b.title = `Search ${sc.name} for “${it.label}”`;
        b.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); closeSuggest(); $('address').blur(); navigate(scopeUrl(sc, it.label)); });
        r.appendChild(b);
      }
      r.addEventListener('mousedown', (e) => { e.preventDefault(); sugSel = i; pickSuggest(); });
      box.appendChild(r); return;
    }
    const r = el('div', 'sug' + (i === sugSel ? ' sel' : ''));
    if (it.fav) { const im = el('img', 'sug-ic'); im.src = it.fav; im.onerror = () => im.replaceWith(svg(ICON.globe, 'sug-ic')); r.appendChild(im); }
    else r.appendChild(svg(it.kind === 'search' ? ICON.search : it.kind === 'tab' ? ICON.tab : it.kind === 'bookmark' ? ICON.star : it.kind === 'history' ? ICON.clock : ICON.globe, 'sug-ic'));
    r.appendChild(el('span', 'sug-t', it.label));
    r.appendChild(el('span', 'sug-s', it.sub));
    r.addEventListener('mousedown', (e) => { e.preventDefault(); sugSel = i; pickSuggest(); });
    box.appendChild(r);
  });
  box.classList.remove('hidden');
}
function pickSuggest() {
  const it = sugItems[sugSel];
  const input = $('address');
  closeSuggest(); input.blur();
  if (!it) { navigate(input.value); return; }
  if (it.kind === 'tab') return activate_(it.id);
  if (it.kind === 'scopes') return navigate(scopeUrl(SCOPES[0], it.label));
  if (it.ai && it.buddy) { window.buddy.show().then(() => window.buddy.ask(it.label)); return; }
  if (it.ai) { navigator.clipboard && navigator.clipboard.writeText(it.label).catch(() => {}); openAI(); toast('Question copied — paste it into Claude'); return; }
  navigate(sugSel === 0 && !it.url ? input.value : it.url);
}
$('address').addEventListener('input', (e) => {
  clearTimeout(sugTimer);
  const inline = e.inputType === 'insertText';
  sugTimer = setTimeout(() => updateSuggest(inline), 40);
});
$('address').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (e.altKey) { newTab(toUrl($('address').value)); closeSuggest(); return; }
    if (sugItems.length) pickSuggest(); else { navigate($('address').value); $('address').blur(); }
  } else if (e.key === 'ArrowDown' && sugItems.length) { e.preventDefault(); sugSel = Math.min(sugSel + 1, sugItems.length - 1); renderSuggest(); }
  else if (e.key === 'ArrowUp' && sugItems.length) { e.preventDefault(); sugSel = Math.max(sugSel - 1, 0); renderSuggest(); }
  else if (e.key === 'Escape') {
    if (sugItems.length) closeSuggest();
    else { $('address').value = displayUrl(activeTab().url); $('address').blur(); const t = activeTab(); if (t && t.wv && !isNewtab(t.url)) t.wv.focus(); }
  }
});
$('address').addEventListener('focus', () => setTimeout(() => $('address').select(), 0));
$('address').addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== $('address')) { closeSuggest(); const t = activeTab(); if (t) $('address').value = displayUrl(t.url); } }, 120));

/* ---------------- left sidebar (Opera-style) ---------------- */
const appViews = new Map();    // item id -> webview
let activeApp = null;
function renderRail() {
  const rail = $('rail'); rail.innerHTML = '';
  document.body.classList.toggle('no-rail', settings.showSidebar === false);
  $('railBtn').classList.toggle('on', settings.showSidebar !== false);
  for (const it of sideItems) {
    const b = el('button', 'rail-item app' + (activeApp === it.id ? ' on' : ''));
    b.title = it.name; b.dataset.id = it.id;
    const img = el('img'); img.draggable = false; img.src = faviconFor(it.url);
    img.onerror = () => img.replaceWith(el('span', 'rail-letter', (it.name || '?')[0].toUpperCase()));
    b.appendChild(img);
    b.addEventListener('click', () => { if (!railJustDragged) toggleApp(it.id); });
    b.addEventListener('pointerdown', (e) => railDragStart(e, b));
    b.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showMenu('ctxMenu', [
        { label: 'Open in a tab', fn: () => openUrl(it.url) },
        { label: 'Reload', fn: () => { const wv = appViews.get(it.id); if (wv) wv.reload(); } },
        { label: 'Sign out / unload', fn: () => { const wv = appViews.get(it.id); if (wv) { wv.remove(); appViews.delete(it.id); } if (activeApp === it.id) closeApp(); } },
        '-',
        { label: 'Move up', disabled: sideItems.indexOf(it) === 0, fn: () => moveSide(it, -1) },
        { label: 'Move down', disabled: sideItems.indexOf(it) === sideItems.length - 1, fn: () => moveSide(it, 1) },
        { label: 'Remove from sidebar', fn: () => { sideItems = sideItems.filter((x) => x !== it); call('sidebar:set', sideItems); const wv = appViews.get(it.id); if (wv) { wv.remove(); appViews.delete(it.id); } if (activeApp === it.id) closeApp(); renderRail(); } }
      ], e.clientX, e.clientY);
    });
    rail.appendChild(b);
  }
  rail.appendChild(el('div', 'rail-sep'));
  const add = el('button', 'rail-item rail-add'); add.title = 'Add to sidebar'; add.appendChild(svg(ICON.plus));
  add.addEventListener('click', railAddForm);
  rail.appendChild(add);
  rail.appendChild(el('div', 'grow'));
  const gear = el('button', 'rail-item'); gear.title = keyLabel('Settings (Ctrl+,)'); gear.appendChild(svg(ICON.gear));
  gear.addEventListener('click', () => openInternal('settings'));
  rail.appendChild(gear);
}
// Drag sidebar icons to reorder (Dock-style): the dragged icon follows the pointer and the
// others slide out of the way; the new order is saved on release. A plain click still opens the app.
let railDrag = null, railJustDragged = false;
function railDragStart(e, b) {
  if (e.button !== 0) return;
  const rail = $('rail');
  railDrag = { b, rail, sy: e.clientY, moved: false, grab: e.clientY - rail.getBoundingClientRect().top + rail.scrollTop - b.offsetTop };
  const move = (ev) => {
    const d = railDrag; if (!d) return;
    if (!d.moved) {
      if (Math.abs(ev.clientY - d.sy) < 5) return;
      d.moved = true; b.classList.add('dragging'); document.body.classList.add('rail-dragging'); hideHoverCard();
    }
    const y = ev.clientY - rail.getBoundingClientRect().top + rail.scrollTop;   // pointer within the rail
    const items = [...rail.querySelectorAll('.rail-item.app')];
    // Where should the dragged icon sit? Before the first other icon whose middle is below the pointer.
    const center = y - d.grab + b.offsetHeight / 2;
    const others = items.filter((x) => x !== b);
    const before = others.find((x) => center < x.offsetTop + x.offsetHeight / 2) || null;
    const target = before || others[others.length - 1].nextSibling;
    if (target !== b && b.nextSibling !== target) {
      const first = new Map(others.map((x) => [x, x.offsetTop]));
      rail.insertBefore(b, target);
      for (const x of others) { const dy = first.get(x) - x.offsetTop; if (dy) x.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 160, easing: 'cubic-bezier(.2,.8,.2,1)' }); }
    }
    b.style.transform = `translateY(${y - d.grab - b.offsetTop}px) scale(1.12)`;
  };
  const up = () => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    const d = railDrag; railDrag = null; if (!d || !d.moved) return;
    railJustDragged = true; setTimeout(() => { railJustDragged = false; }, 0);
    document.body.classList.remove('rail-dragging');
    const order = [...d.rail.querySelectorAll('.rail-item.app')].map((x) => x.dataset.id);
    b.style.transform = ''; b.classList.remove('dragging');
    const next = order.map((id) => sideItems.find((x) => x.id === id)).filter(Boolean);
    if (next.length === sideItems.length && next.some((x, i) => x !== sideItems[i])) { sideItems = next; call('sidebar:set', sideItems); }
    renderRail();
  };
  addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}
function moveSide(it, d) { const i = sideItems.indexOf(it); sideItems.splice(i, 1); sideItems.splice(i + d, 0, it); call('sidebar:set', sideItems); renderRail(); }
function railAddForm() {
  const pop = $('popover'); pop.innerHTML = ''; pop.className = 'pop rail-pop';
  pop.appendChild(el('div', 'pop-title serif', 'Add to sidebar'));
  const f = el('form', 'stack');
  const name = el('input', 'text-in'); name.placeholder = 'Name (e.g. Messenger)'; name.required = true; name.maxLength = 30;
  const url = el('input', 'text-in'); url.placeholder = 'https://…'; url.required = true;
  const cur = activeTab(); if (cur && /^https?:/.test(cur.url)) { url.value = new URL(cur.url).origin; name.value = hostOf(cur.url).split('.')[0].replace(/^./, (c) => c.toUpperCase()); }
  const row = el('div', 'pop-actions'); const ok = el('button', 'pill solid', 'Add'); ok.type = 'submit'; row.append(el('div', 'grow'), ok);
  f.append(name, url, row);
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    let u = url.value.trim(); if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    try { new URL(u); } catch { toast('That URL does not look right'); return; }
    const it = { id: 'c' + Date.now().toString(36), name: name.value.trim() || hostOf(u), url: u };
    sideItems.push(it); call('sidebar:set', sideItems); hidePop(); renderRail(); toggleApp(it.id);
  });
  pop.appendChild(f);
  const r = document.querySelector('.rail-add').getBoundingClientRect();
  showPopAt(pop, r.right + 8, r.top);
  name.focus();
}
function toggleApp(id) { if (activeApp === id && !$('appPanel').classList.contains('hidden')) closeApp(); else openApp(id); }
function openApp(id) {
  const it = sideItems.find((x) => x.id === id); if (!it) return;
  activeApp = id;
  if (!appViews.has(id)) {
    const wv = document.createElement('webview');
    wv.setAttribute('partition', it.ai ? info.ai : info.apps);
    wv.setAttribute('allowpopups', '');
    wv.setAttribute('src', it.url);
    $('appViews').appendChild(wv);
    appViews.set(id, wv);
  }
  for (const [k, wv] of appViews) wv.classList.toggle('visible', k === id);
  $('appTitle').textContent = it.name;
  $('appPanel').classList.remove('hidden'); $('appResizer').classList.remove('hidden');
  $('appPanel').style.width = (settings.appWidth || 400) + 'px';
  renderRail();
}
function closeApp() { activeApp = null; $('appPanel').classList.add('hidden'); $('appResizer').classList.add('hidden'); renderRail(); }
$('appClose').addEventListener('click', closeApp);
$('appReload').addEventListener('click', () => { const wv = appViews.get(activeApp); if (wv) wv.reload(); });
$('appOpenTab').addEventListener('click', () => { const it = sideItems.find((x) => x.id === activeApp); if (it) openUrl(appViews.get(activeApp).getURL() || it.url); });
$('railBtn').addEventListener('click', () => call('settings:set', { showSidebar: settings.showSidebar === false }));

function makeResizer(handle, panel, side, key, min = 280) {
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const shield = $('dragShield'); shield.classList.remove('hidden');
    const start = e.clientX, w0 = panel.getBoundingClientRect().width;
    const move = (ev) => { const d = side === 'left' ? ev.clientX - start : start - ev.clientX; panel.style.width = Math.max(min, Math.min(innerWidth - 420, w0 + d)) + 'px'; };
    const up = () => { shield.classList.add('hidden'); removeEventListener('mousemove', move); removeEventListener('mouseup', up); call('settings:set', { [key]: Math.round(panel.getBoundingClientRect().width) }); };
    addEventListener('mousemove', move); addEventListener('mouseup', up);
  });
}
makeResizer($('appResizer'), $('appPanel'), 'left', 'appWidth');
makeResizer($('aiResizer'), $('aiPanel'), 'right', 'aiWidth');

/* ---------------- AI sidebar ---------------- */
const aiViews = new Map();
let aiBot = null;
function renderBots() {
  const box = $('botPills'); box.innerHTML = '';
  for (const b of bots) {
    const p = el('button', 'pill' + (aiBot === b.url ? ' active' : ''), b.name);
    p.title = b.url;
    p.addEventListener('click', () => selectBot(b.url));
    if (b.custom) { const rm = el('span', 'rm', '×'); rm.title = 'Remove ' + b.name; rm.addEventListener('click', (e) => { e.stopPropagation(); removeBot(b.url); }); p.appendChild(rm); }
    box.appendChild(p);
  }
}
function selectBot(url) {
  if (!bots.some((b) => b.url === url)) url = bots[0] && bots[0].url;
  if (!url) return;
  aiBot = url;
  if (!aiViews.has(url)) {
    const wv = document.createElement('webview');
    wv.setAttribute('partition', info.ai); wv.setAttribute('allowpopups', ''); wv.setAttribute('src', url);
    $('aiViews').appendChild(wv); aiViews.set(url, wv);
  }
  for (const [u, wv] of aiViews) wv.classList.toggle('visible', u === url);
  renderBots();
}
function openAI() {
  $('aiPanel').classList.remove('hidden'); $('aiResizer').classList.remove('hidden'); $('aiBtn').classList.add('on');
  $('aiPanel').style.width = (settings.aiWidth || 420) + 'px';
  selectBot(aiBot || settings.defaultBot || (bots[0] && bots[0].url));
}
function closeAI() { $('aiPanel').classList.add('hidden'); $('aiResizer').classList.add('hidden'); $('aiBtn').classList.remove('on'); }
function toggleAI() { $('aiPanel').classList.contains('hidden') ? openAI() : closeAI(); }
function removeBot(url) {
  bots = bots.filter((b) => b.url !== url); call('bots:set', bots);
  const wv = aiViews.get(url); if (wv) { wv.remove(); aiViews.delete(url); }
  if (aiBot === url) selectBot(bots[0] && bots[0].url); else renderBots();
}
$('botAddBtn').addEventListener('click', () => { $('botForm').classList.toggle('hidden'); if (!$('botForm').classList.contains('hidden')) $('botName').focus(); });
$('botForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('botName').value.trim(); let url = $('botUrl').value.trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  try { new URL(url); } catch { toast('That URL does not look right'); return; }
  if (!name) return;
  if (!bots.some((b) => b.url === url)) { bots.push({ name, url, custom: true }); call('bots:set', bots); }
  $('botName').value = ''; $('botUrl').value = ''; $('botForm').classList.add('hidden');
  selectBot(url);
});
$('aiClose').addEventListener('click', closeAI);
$('aiBtn').addEventListener('click', () => window.aiButtonAction());

/* ---------------- command bar (Ctrl+K) ---------------- */
let cmdSel = 0, cmdItems = [];
function openCmd() { $('cmdInput').value = ''; $('cmdbar').classList.remove('hidden'); $('cmdInput').focus(); renderCmd(); }
function closeCmd() { $('cmdbar').classList.add('hidden'); }
function renderCmd() {
  const raw = $('cmdInput').value.trim(); const q = raw.toLowerCase();
  const box = $('cmdResults'); box.innerHTML = ''; cmdItems = [];
  if (q) cmdItems.push({ kind: 'go', label: toUrl(raw) === searchUrl(raw) ? `Search ${engineName()} for “${raw}”` : toUrl(raw), url: toUrl(raw), k: 'New tab' });
  const m = (s) => !q || (s || '').toLowerCase().includes(q);
  for (const t of tabs) if (t.id !== activeId && !isNewtab(t.url) && (m(t.title) || m(t.url))) cmdItems.push({ kind: 'tab', label: prettyTitle(t), fav: t.favicon, id: t.id, k: 'Switch to tab' });
  const actions = [['Settings', () => openInternal('settings')], ['History', () => openInternal('history')], ['Downloads', () => openInternal('downloads')], ['Bookmarks', () => openInternal('bookmarks')], ['New private window', () => call('win:new', { incognito: true })], ['Reopen closed tab', reopenClosed], ['Toggle split view', () => toggleSplit()], ['Toggle AI sidebar', toggleAI]];
  for (const [label, fn] of actions) if (q && label.toLowerCase().includes(q)) cmdItems.push({ kind: 'act', label, fn, k: 'Action' });
  for (const b of bookmarks) if (q && b.type === 'bookmark' && (m(b.title) || m(b.url))) cmdItems.push({ kind: 'url', label: b.title, fav: faviconFor(b.url), url: b.url, k: 'Bookmark' });
  for (const b of bots) if (q && m(b.name)) cmdItems.push({ kind: 'bot', label: 'Ask ' + b.name, url: b.url, k: 'AI sidebar' });
  cmdItems = cmdItems.slice(0, 9);
  cmdSel = Math.min(cmdSel, Math.max(0, cmdItems.length - 1));
  cmdItems.forEach((it, i) => {
    const r = el('div', 'cmd-item' + (i === cmdSel ? ' sel' : ''));
    if (it.fav) { const im = el('img'); im.src = it.fav; im.onerror = () => im.replaceWith(svg(ICON.globe, 'ic')); r.appendChild(im); }
    else r.appendChild(svg(it.kind === 'tab' ? ICON.tab : it.kind === 'act' ? ICON.gear : ICON.search, 'ic'));
    r.appendChild(el('span', 't', it.label)); r.appendChild(el('span', 'k', it.k));
    r.addEventListener('mousedown', (e) => { e.preventDefault(); cmdSel = i; runCmdBar(); });
    box.appendChild(r);
  });
}
function runCmdBar() {
  const it = cmdItems[cmdSel]; closeCmd(); if (!it) return;
  if (it.kind === 'tab') return activate_(it.id);
  if (it.kind === 'act') return it.fn();
  if (it.kind === 'bot') { openAI(); selectBot(it.url); return; }
  openUrl(it.url, 'foreground');
}
$('cmdInput').addEventListener('input', () => { cmdSel = 0; renderCmd(); });
$('cmdInput').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); closeCmd(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); cmdSel = Math.min(cmdSel + 1, cmdItems.length - 1); renderCmd(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); cmdSel = Math.max(cmdSel - 1, 0); renderCmd(); }
  else if (e.key === 'Enter') { e.preventDefault(); runCmdBar(); }
});
$('cmdbar').addEventListener('mousedown', (e) => { if (e.target.id === 'cmdbar') closeCmd(); });

/* ---------------- toolbar buttons ---------------- */
$('newTabBtn').addEventListener('click', () => newTab());
$('titlebar').addEventListener('dblclick', (e) => { if (e.target.id === 'tabs') newTab(); });
$('tabs').addEventListener('auxclick', (e) => { if (e.button === 1 && e.target.id === 'tabs') newTab(); });
$('backBtn').addEventListener('click', () => { const t = activeTab(); if (t && t.wv && t.wv.canGoBack()) t.wv.goBack(); });
$('fwdBtn').addEventListener('click', () => { const t = activeTab(); if (t && t.wv && t.wv.canGoForward()) t.wv.goForward(); });
$('reloadBtn').addEventListener('click', (e) => { const t = activeTab(); if (!t || !t.wv) return; if (t.loading) t.wv.stop(); else if (e.shiftKey) t.wv.reloadIgnoringCache(); else t.wv.reload(); });
$('homeBtn').addEventListener('click', () => navigate(NEWTAB));
$('zoomBtn').addEventListener('click', () => zoom(0));

function renderShield(s) { $('adblockBtn').classList.toggle('on', !!s.on); $('blockedCount').textContent = s.count; $('adblockBtn').title = s.on ? `Blocking ads & trackers (${s.count} blocked) — click to turn off` : 'Ad & tracker blocker is off — click to turn on'; }
$('adblockBtn').addEventListener('click', async () => { const s = await call('adblock:set', !settings.adblock); renderShield(s); toast(s.error ? 'Blocker could not start' : s.on ? 'Shield on — reload to apply' : 'Shield off'); });
api.on('adblock:count', (n) => { $('blockedCount').textContent = n; });

const PIP_JS = `(() => {
  if (document.pictureInPictureElement) { document.exitPictureInPicture(); return 'exit'; }
  const v = [...document.querySelectorAll('video')].filter((x) => x.readyState > 0)
    .sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
  if (!v) return 'none';
  v.removeAttribute('disablepictureinpicture');
  return v.requestPictureInPicture().then(() => 'ok', () => 'err');
})()`;
$('pipBtn').addEventListener('click', async () => {
  const t = activeTab(); if (!t || !t.wv || !t.ready) return;
  try { const r = await t.wv.executeJavaScript(PIP_JS, true); if (r === 'none') toast('No video found on this page'); else if (r === 'err') toast('This video cannot pop out'); }
  catch { toast('This page does not allow pop-out'); }
});

/* ---------------- shortcuts ---------------- */
function cycle(dir) {
  const vis = tabs.filter((t) => t.pinned || !(t.groupId && groups.get(t.groupId).collapsed));
  const i = vis.findIndex((t) => t.id === activeId);
  if (vis.length) activate_(vis[(i + dir + vis.length) % vis.length].id);
}
async function viewSource(tab) {
  if (!tab || !tab.wv || !tab.ready || isInternal(tab.url)) return;
  let html = '';
  try { html = await tab.wv.executeJavaScript('"<!DOCTYPE " + (document.doctype ? document.doctype.name : "html") + ">\\n" + document.documentElement.outerHTML'); } catch { toast('Could not read the page source'); return; }
  const src = tab.url;
  const t = newTab('stupid://source/', { afterId: tab.id });
  const push = () => { t.wv.executeJavaScript(`window.__setSource(${JSON.stringify(src)}, ${JSON.stringify(html)})`).catch(() => {}); };
  t.wv.addEventListener('dom-ready', push, { once: true });
}
function runCmd(cmd) {
  const t = activeTab();
  const wv = t && t.wv && t.ready ? t.wv : null;
  switch (cmd) {
    case 'new-tab': newTab(); break;
    case 'close-tab': if (t) closeTab(t.id); break;
    case 'close-window': call('win:close'); break;
    case 'reopen-tab': reopenClosed(); break;
    case 'focus-address': $('address').focus(); $('address').select(); break;
    case 'command-bar': openCmd(); break;
    case 'reload': if (wv) wv.reload(); break;
    case 'hard-reload': if (wv) wv.reloadIgnoringCache(); break;
    case 'back': $('backBtn').click(); break;
    case 'forward': $('fwdBtn').click(); break;
    case 'home': $('homeBtn').click(); break;
    case 'bookmark': toggleBookmark(); break;
    case 'toggle-bookmarks-bar': call('settings:set', { showBookmarksBar: settings.showBookmarksBar === false }); break;
    case 'bookmarks': openInternal('bookmarks'); break;
    case 'history': openInternal('history'); break;
    case 'downloads': openInternal('downloads'); break;
    case 'settings': openInternal('settings'); break;
    case 'clear-data': openUrlInternal('settings', '#clear'); break;
    case 'toggle-ai': window.aiButtonAction(); break;
    case 'open-ai': openAI(); toast('Selection copied — paste it into the chat'); break;
    case 'toggle-sidebar': call('settings:set', { showSidebar: settings.showSidebar === false }); break;
    case 'split': toggleSplit(); break;
    case 'next-tab': cycle(1); break;
    case 'prev-tab': cycle(-1); break;
    case 'find': openFind(); break;
    case 'find-next': if ($('findBar').classList.contains('hidden')) openFind(); else find(true, true); break;
    case 'find-prev': if ($('findBar').classList.contains('hidden')) openFind(); else find(false, true); break;
    case 'print': if (wv) wv.print().catch(() => {}); break;
    case 'view-source': viewSource(t); break;
    case 'devtools': if (wv) { if (wv.isDevToolsOpened()) wv.closeDevTools(); else wv.openDevTools(); } break;
    case 'zoom-in': zoom(1); break;
    case 'zoom-out': zoom(-1); break;
    case 'zoom-reset': zoom(0); break;
    default:
      if (cmd.startsWith('tab-')) { const n = +cmd.slice(4); const tt = n === 9 ? tabs[tabs.length - 1] : tabs[n - 1]; if (tt) activate_(tt.id); }
  }
}
api.on('shortcut', runCmd);
api.on('open-url', ({ url, where, opener }) => openUrl(url, where, opener));
api.on('fullscreen', (on) => document.body.classList.toggle('fullscreen', on));
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { hideAllPops(); hideHoverCard(); if (!$('cmdbar').classList.contains('hidden')) closeCmd(); }
});

/* ---------------- audio polling (tab speaker icons) ---------------- */
setInterval(() => {
  for (const t of tabs) {
    if (!t.wv || !t.ready) continue;
    let a = false; try { a = t.wv.isCurrentlyAudible(); } catch {}
    if (a !== !!t.audible) { t.audible = a; renderTab(t); }
  }
}, 1200);

/* ---------------- tab sleeping (Memory saver) ----------------
   Background tabs that haven't been looked at for a while are unloaded (their webview is removed) and
   reload instantly when clicked, like Chrome's Memory Saver. Settings → Performance sets the delay. */
function sleepable(t) { return t.wv && t.id !== activeId && !(split && split.includes(t.id)) && !t.audible && !t.loading; }
async function sleepTab(t, now = false) {
  if (!sleepable(t)) return false;
  // Don't throw away half-typed text.
  if (!now || t.ready) {
    let typing = false;
    try { typing = await t.wv.executeJavaScript('[...document.querySelectorAll("input,textarea,[contenteditable=true]")].some((e) => e.isContentEditable ? (e.textContent || "").trim().length > 0 && document.activeElement === e : (e.type !== "hidden" && e.type !== "password" && e.type !== "checkbox" && e.type !== "radio" && e.value && e.value !== e.defaultValue))'); } catch {}
    if (typing || !sleepable(t)) return false;
  }
  try { const u = t.wv.getURL(); if (u) t.url = u; const ti = t.wv.getTitle(); if (ti) t.title = ti; } catch {}
  t.wv.remove(); t.wv = null; t.ready = false; t.loading = false; t.asleep = true;
  renderTab(t);
  return true;
}
setInterval(() => {
  const mins = settings.tabSleep == null ? 15 : +settings.tabSleep;
  if (!mins) return;
  const cutoff = Date.now() - mins * 60000;
  for (const t of tabs) if (sleepable(t) && (t.lastActive || 0) < cutoff) sleepTab(t);
}, 60000);

/* ---------------- session save ---------------- */
let saveTimer;
function scheduleSave() {
  if (info.incognito) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const list = tabs.filter((t) => !isInternal(t.url) || !isNewtab(t.url) || tabs.length === 1);
    const data = {
      tabs: list.map((t) => ({ url: t.url, title: t.title, favicon: t.favicon, pinned: t.pinned, groupId: t.groupId, muted: t.muted })),
      groups: [...groups.values()],
      active: Math.max(0, list.findIndex((t) => t.id === activeId))
    };
    call('session:save', data);
    const pinned = tabs.filter((t) => t.pinned && !isInternal(t.url)).map((t) => ({ url: t.url, title: t.title, favicon: t.favicon }));
    if (JSON.stringify(pinned) !== JSON.stringify(settings.pinned || [])) call('settings:set', { pinned });
  }, 500);
}

/* ---------------- settings ---------------- */
function applySettings() {
  const root = document.documentElement.style;
  root.setProperty('--accent', ACCENTS[settings.accent] || ACCENTS.clay);
  root.setProperty('--accent-soft', (ACCENTS[settings.accent] || ACCENTS.clay) + '26');
  document.body.classList.toggle('no-home', settings.showHome === false);
  document.body.classList.toggle('no-bm', settings.showBookmarksBar === false);
  $('address').placeholder = `Search ${engineName()} or type a URL`;
  renderShield({ on: settings.adblock, count: +$('blockedCount').textContent || 0 });
  renderRail();
}
api.on('settings:changed', (s) => { settings = s; applySettings(); renderBookmarks(); updateNav(); });
api.on('bookmarks:changed', (b) => { bookmarks = b; renderBookmarks(); updateNav(); });
api.on('bots:changed', (b) => { bots = b; renderBots(); });
api.on('sidebar:changed', (s) => { sideItems = s; renderRail(); });

/* ---------------- update banner ---------------- */
let updateDismissed = null;
function renderUpdate(u) {
  let b = $('updateBanner');
  if (!u || u.status !== 'ready' || updateDismissed === u.version) { if (b) b.remove(); return; }
  if (b) return;
  b = el('div', 'update-banner'); b.id = 'updateBanner';
  const txt = el('div', 'ub-text');
  txt.appendChild(el('div', 'ub-title serif', 'An update is ready'));
  txt.appendChild(el('div', 'ub-sub', `Version ${u.version} is downloaded. Restart to finish, or it installs when you close the browser.`));
  const later = el('button', 'pill', 'Later');
  later.addEventListener('click', () => { updateDismissed = u.version; b.remove(); });
  const go = el('button', 'pill solid', 'Restart to update');
  go.addEventListener('click', async () => { go.disabled = true; go.textContent = 'Restarting…'; const ok = await call('update:install'); if (!ok) { go.disabled = false; go.textContent = 'Restart to update'; toast('Update could not start — try again from Settings'); } });
  b.append(el('span', 'ub-dot'), txt, later, go);
  document.body.appendChild(b);
}
api.on('update:status', renderUpdate);

/* ---------------- boot ---------------- */
(async function boot() {
  [info, settings, bookmarks, bots, sideItems] = await Promise.all([call('win:info'), call('settings:get'), call('bookmarks:get'), call('bots:get'), call('sidebar:get')]);
  if (info.incognito) { document.body.classList.add('incognito'); $('privateBadge').classList.remove('hidden'); }
  applySettings();
  renderBookmarks();
  renderBots();
  const restore = info.restore;
  if (restore && restore.tabs && restore.tabs.length) {
    restoring = true;
    for (const g of restore.groups || []) groups.set(g.id, Object.assign({}, g));
    const act = Math.min(restore.active || 0, restore.tabs.length - 1);
    restore.tabs.forEach((t, i) => newTab(t.url, { activate: false, lazy: i !== act, pinned: !!t.pinned, title: t.title, favicon: t.favicon, groupId: t.groupId || null, muted: !!t.muted }));
    restoring = false; normalizeOrder();
    activate_(tabs[Math.min(act, tabs.length - 1)].id);
  } else if (!info.incognito) {
    for (const p of settings.pinned || []) newTab(p.url, { activate: false, pinned: true, title: p.title, favicon: p.favicon, lazy: true });
  }
  if (info.urls && info.urls.length) info.urls.forEach((u, i) => newTab(u, { activate: i === 0 }));
  else if (!restore || !restore.tabs || !restore.tabs.length) newTab();
  renderShield(await call('adblock:get'));
  const prev = await call('downloads:list');
  for (const d of prev.filter((x) => x.state === 'progressing')) dls.set(d.id, d);
  renderDlBtn();
  renderUpdate(await call('update:status'));
})();
