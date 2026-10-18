/* The Stupid Browser for Android: the phone UI. Tabs are native web views placed under <webview> stand-ins
 * (mac/js/host-shell.js); settings, Shield, bookmarks, history, downloads and Buddy's brain are the shared core
 * (window.stupid.invoke), and new tab / settings / history / bookmarks are the desktop app's own pages. */
'use strict';
const api = window.stupid;
const call = (ch, ...a) => api.invoke(ch, ...a);
const $ = (id) => document.getElementById(id);
const post = (m) => window.webkit.messageHandlers.host.postMessage(m);
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function icon(path) { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.innerHTML = path; return s; }
const I = {
  menu: '<circle cx="12" cy="5.5" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="18.5" r="1.5" fill="currentColor" stroke="none"/>',
  lock: '<rect x="6" y="11" width="12" height="9" rx="2.2"/><path d="M8.5 11V8.5a3.5 3.5 0 0 1 7 0V11"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.4"/>',
  warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.4"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  back: '<path d="M15 5l-7 7 7 7"/>', fwd: '<path d="M9 5l7 7-7 7"/>',
  reload: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v4.2h-4.2"/>',
  star: '<path d="M12 3.8l2.5 5.2 5.7.6-4.3 3.9 1.2 5.7L12 16.3l-5.1 2.9 1.2-5.7L3.8 9.6l5.7-.6z"/>',
  share: '<path d="M12 4v11M7.5 8.5L12 4l4.5 4.5M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', private: '<path d="M4 10c2-4 14-4 16 0l-2 7H6z"/><circle cx="9" cy="14" r="1.6"/><circle cx="15" cy="14" r="1.6"/>',
  bookmarks: '<path d="M7 4h10v16l-5-3.5L7 20z"/>', history: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/>', find: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3M8.5 11h5"/>',
  zoom: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3M11 8.5v5M8.5 11h5"/>', brush: '<path d="M14.5 4.5l5 5-8.5 8.5H6v-5z"/><path d="M12 7l5 5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.6 2.6 14.4 0 17M12 3.5c-2.6 2.6-2.6 14.4 0 17"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', tab: '<rect x="4" y="5" width="16" height="14" rx="3"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  send: '<path d="M5 12h13M12.5 6l6 6-6 6"/>', stop: '<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/>',
  up: '<path d="M6 15l6-6 6 6"/>', down: '<path d="M6 9l6 6 6-6"/>', copy: '<rect x="8" y="8" width="11" height="11" rx="2.5"/><path d="M5 15V6a1.5 1.5 0 0 1 1.5-1.5H15"/>',
  open: '<path d="M14 5h5v5M19 5l-8 8M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  shield: '<path d="M12 3.5l7 3v5.5c0 4.3-3 7.4-7 8.5-4-1.1-7-4.2-7-8.5V6.5z"/>', trash: '<path d="M5 7h14M10 4h4M7 7l1 12.5h8L17 7"/>',
};
$('menuBtn').appendChild(icon(I.menu)); $('newBtn').appendChild(icon(I.plus)); $('clearBtn').appendChild(icon(I.x));
$('findPrev').appendChild(icon(I.up)); $('findNext').appendChild(icon(I.down)); $('findClose').appendChild(icon(I.x));
$('gridNew').appendChild(icon(I.plus)); $('bdClose').appendChild(icon(I.x)); $('bdLook').appendChild(icon(I.eye)); $('bdSend').appendChild(icon(I.send));

const NEWTAB = 'stupid://newtab/';
const ACCENTS = { clay: '#D97757', sand: '#C9963F', sage: '#6F9161', sky: '#5B87B5', plum: '#9A6390', rose: '#C8606F', ink: '#5A5548' };
const TITLES = { newtab: 'New tab', settings: 'Settings', history: 'History', bookmarks: 'Bookmarks', downloads: 'Downloads', welcome: 'Welcome', rewind: 'Rewind' };
let info = {}, settings = {}, bookmarks = [], shield = { on: true, count: 0 };
let tabs = [], activeId = null, nextId = 1, spare = null;
const isInternal = (u) => /^stupid:\/\//.test(u || '');
const isNewtab = (u) => !u || /^stupid:\/\/newtab\/?([?#].*)?$/.test(u);
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const tabById = (id) => tabs.find((t) => t.id === id);
const active = () => tabById(activeId);
const buddyName = () => (settings.buddyLook && settings.buddyLook.name) || 'Buddy';
const engineName = () => settings.search === 'custom' ? 'the web' : ((settings.engines || {})[settings.search] || { name: 'DuckDuckGo' }).name;
const searchUrl = (q) => (settings.searchUrl || 'https://duckduckgo.com/?q=%s').replace('%s', encodeURIComponent(q));
function title(t) {
  if (isInternal(t.url)) { try { const n = new URL(t.url).hostname; if (!t.title || t.title === t.url || t.title.startsWith('stupid:')) return TITLES[n] || 'Page'; } catch {} }
  return t.title || hostOf(t.url) || 'New tab';
}
function toUrl(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  if (/^(https?|stupid|about|data):/i.test(t)) return t;
  if (/^localhost(:\d+)?(\/.*)?$/i.test(t) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(t)) return 'http://' + t;
  if (!/\s/.test(t) && /^[^\s/]+\.[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(t)) return 'https://' + t;
  return searchUrl(t);
}
let toastT;
function toast(msg, action) {
  const t = $('toast'); t.replaceChildren(el('span', 'grow', msg));
  if (action) { const b = el('button', null, action.label); b.addEventListener('click', () => { t.classList.add('hidden'); action.fn(); }); t.appendChild(b); }
  t.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), action ? 4500 : 2400);
}

/* ---------------- tabs ---------------- */
function makeView(tab) {
  const wv = document.createElement('webview');
  wv.setAttribute('partition', info.partition || 'persist:main');
  wv.setAttribute('allowpopups', '');
  wv.setAttribute('src', tab.url);
  tab.wv = wv; tab.ready = false;
  wv.addEventListener('dom-ready', () => { tab.ready = true; if (tab.zoom && tab.zoom !== 1) wv.setZoomFactor(tab.zoom); });
  wv.addEventListener('did-start-loading', () => { tab.loading = true; if (tab.id === activeId) progress(true); });
  wv.addEventListener('did-stop-loading', () => { tab.loading = false; if (tab.id === activeId) progress(false); renderBar(); save(); });
  const nav = (e) => { tab.url = e.url; if (tab.id === activeId) renderBar(); save(); };
  wv.addEventListener('did-navigate', (e) => { tab.favicon = null; nav(e); });
  wv.addEventListener('did-navigate-in-page', nav);
  wv.addEventListener('page-title-updated', (e) => { tab.title = e.title; if (tab.id === activeId) renderBar(); save(); });
  wv.addEventListener('page-favicon-updated', (e) => { tab.favicon = (e.favicons || [])[0] || null; save(); });
  wv.addEventListener('found-in-page', (e) => { if (tab.id === activeId) $('findCount').textContent = `${e.result.activeMatchOrdinal || 0}/${e.result.matches || 0}`; });
  wv.addEventListener('ipc-message', (e) => { if (e.channel === 'stupid-sel' && tab.id === activeId) onSelection(e.args[0]); });
  wv.addEventListener('focus', () => { if (document.activeElement) document.activeElement.blur(); });
  $('views').appendChild(wv);
}
function makeSpare() {
  if (spare || info.incognito === undefined) return;
  spare = { id: nextId++, url: NEWTAB, title: '', favicon: null };
  makeView(spare); spare.wv.classList.add('spare');
}
let spareT;
const queueSpare = (ms = 700) => { clearTimeout(spareT); spareT = setTimeout(() => requestIdleCallback(makeSpare, { timeout: 2000 }), ms); };

function newTab(url, { activate = true, lazy = false, title: t0, favicon, opener } = {}) {
  let tab;
  if (!lazy && (!url || url === NEWTAB) && spare && spare.ready) { tab = spare; spare = null; tab.wv.classList.remove('spare'); queueSpare(); }
  else tab = { id: nextId++, url: url || NEWTAB, title: t0 || '', favicon: favicon || null };
  if (opener != null) { const i = tabs.findIndex((x) => x.id === opener); tabs.splice(i < 0 ? tabs.length : i + 1, 0, tab); } else tabs.push(tab);
  if (!lazy && !tab.wv) makeView(tab);
  if (activate) activate_(tab.id); else renderCount();
  save();
  return tab;
}
function activate_(id) {
  const tab = tabById(id); if (!tab) return;
  const prev = active();
  if (prev && prev !== tab) snap(prev);
  activeId = id;
  if (!tab.wv) makeView(tab);
  for (const t of tabs) if (t.wv) t.wv.classList.toggle('visible', t.id === id);
  progress(!!tab.loading);
  renderBar(); renderCount(); save();
}
function closeTab(id) {
  const i = tabs.findIndex((t) => t.id === id); if (i < 0) return;
  const [t] = tabs.splice(i, 1);
  closed.push({ url: t.url, title: t.title }); if (closed.length > 20) closed.shift();
  if (t.wv) t.wv.remove();
  if (!tabs.length) { if (info.incognito) { call('win:close'); return; } newTab(); return; }
  if (activeId === id) activate_(tabs[Math.min(i, tabs.length - 1)].id); else renderCount();
  save();
}
const closed = [];
function openUrl(url, where = 'foreground', opener = null) {
  if (where === 'background') { newTab(url, { activate: false, opener }); toast('Opened in a new tab', { label: 'Show', fn: () => activate_(tabs[tabs.length - 1].id) }); }
  else newTab(url, { opener });
}
function navigate(text) {
  const url = toUrl(text); if (!url) return;
  const t = active();
  if (!t) { newTab(url); return; }
  t.url = url; t.title = '';
  if (t.wv) t.wv.loadURL(url); else makeView(t);
  renderBar();
}
let saveT;
function save() {
  if (info.incognito) return;
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    const list = tabs.filter((t) => t.url);
    call('session:save', { tabs: list.map((t) => ({ url: t.url, title: t.title, favicon: t.favicon })), groups: [], active: Math.max(0, list.findIndex((t) => t.id === activeId)) });
  }, 500);
}

/* ---------------- top bar ---------------- */
function renderBar() {
  const t = active(); if (!t) return;
  const typing = document.body.classList.contains('typing');
  if (!typing) $('addr').value = isNewtab(t.url) ? '' : isInternal(t.url) ? title(t) : prettyUrl(t.url);
  const site = $('siteBtn'); site.replaceChildren(); site.className = 'omni-ic';
  if (isNewtab(t.url) || typing) site.appendChild(icon(I.search));
  else if (/^https:/.test(t.url)) { site.appendChild(icon(I.lock)); site.classList.add('secure'); }
  else if (/^http:/.test(t.url)) { site.appendChild(icon(I.warn)); site.classList.add('warn'); }
  else site.appendChild(icon(I.info));
  document.title = title(t);
}
const prettyUrl = (u) => { try { const x = new URL(u); return x.hostname.replace(/^www\./, '') + (x.pathname.length > 1 ? x.pathname : '') + x.search; } catch { return u; } };
const tabCount = () => (tabs.length > 99 ? ':D' : String(tabs.length));
function renderCount() {}
let progT;
function progress(on) {
  const p = $('progress'); clearTimeout(progT);
  if (on) { p.classList.add('on'); p.style.transform = 'scaleX(.15)'; progT = setTimeout(() => { p.style.transform = 'scaleX(.7)'; }, 300); }
  else { p.style.transform = 'scaleX(1)'; progT = setTimeout(() => { p.classList.remove('on'); p.style.transform = 'scaleX(0)'; }, 300); }
}
function renderShield() { $('shieldBtn').classList.toggle('on', !!shield.on); $('shieldCount').textContent = shield.on ? shield.count : 'Off'; }

/* ---------------- typing in the address bar ---------------- */
const addr = $('addr');
addr.addEventListener('focus', () => {
  document.body.classList.add('typing');
  const t = active(); addr.value = t && !isNewtab(t.url) && !isInternal(t.url) ? t.url : '';
  renderBar(); setTimeout(() => addr.select(), 0); suggest();
});
addr.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== addr) { document.body.classList.remove('typing'); $('suggest').classList.add('hidden'); $('clearBtn').classList.add('hidden'); renderBar(); } }, 120));
addr.addEventListener('input', () => { $('clearBtn').classList.toggle('hidden', !addr.value); suggest(); });
addr.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const v = addr.value; addr.blur(); navigate(v); } });
$('clearBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); addr.value = ''; addr.dispatchEvent(new Event('input')); });
const SCOPES = [['Reddit', 'reddit.com'], ['YouTube', null, 'https://www.youtube.com/results?search_query=%s'], ['Wikipedia', null, 'https://en.wikipedia.org/w/index.php?search=%s'], ['Stack Overflow', 'stackoverflow.com'], ['Quora', 'quora.com']];
let sugToken = 0;
async function suggest() {
  const q = addr.value.trim(), box = $('suggest'), token = ++sugToken;
  box.classList.remove('hidden'); box.replaceChildren();
  const row = (ic, t, s, fn, cls) => {
    const b = el('button', 'sug' + (cls ? ' ' + cls : ''));
    const i = el('span', 'ic'); if (typeof ic === 'string') { if (ic.startsWith('http') || ic.startsWith('data:')) { const img = el('img'); img.src = ic; img.onerror = () => img.replaceWith(icon(I.globe)); i.appendChild(img); } else i.appendChild(icon(ic)); } else i.appendChild(ic);
    const tx = el('span', 'txt'); tx.appendChild(el('div', 't', t)); if (s) tx.appendChild(el('div', 's', s));
    b.append(i, tx); b.addEventListener('pointerdown', (e) => e.preventDefault()); b.addEventListener('click', fn); box.appendChild(b);
  };
  if (!q) {
    // Nothing typed yet: your open tabs and bookmarks, one tap away.
    const others = tabs.filter((t) => t.id !== activeId && !isNewtab(t.url)).slice(-4).reverse();
    if (others.length) { box.appendChild(el('div', 'sug-head', 'Open tabs')); for (const t of others) row(t.favicon || I.tab, title(t), prettyUrl(t.url), () => { addr.blur(); activate_(t.id); }); }
    const bms = bookmarks.filter((b) => b.type === 'bookmark').slice(-6).reverse();
    if (bms.length) { box.appendChild(el('div', 'sug-head', 'Bookmarks')); for (const b of bms) row(b.favicon || faviconFor(b.url) || I.star, b.title || b.url, prettyUrl(b.url), () => { addr.blur(); navigate(b.url); }); }
    return;
  }
  const go = toUrl(q), isSearch = go === searchUrl(q);
  row(isSearch ? I.search : I.globe, isSearch ? q : prettyUrl(go), isSearch ? `Search ${engineName()}` : 'Open', () => { addr.blur(); navigate(q); });
  if (isSearch) {
    const chips = el('div', 'chips');
    chips.appendChild(el('span', 'sug-s'));
    for (const [n, site, u] of SCOPES) { const c = el('button', 'chip', n); c.addEventListener('pointerdown', (e) => e.preventDefault()); c.addEventListener('click', () => { addr.blur(); navigate(u ? u.replace('%s', encodeURIComponent(q)) : searchUrl(`${q} site:${site}`)); }); chips.appendChild(c); }
    box.appendChild(chips);
    const ball = el('span', 'ball small'); ball.append(el('i'), el('i'));
    row(ball, q, `Ask ${buddyName()}`, () => { addr.blur(); openBuddy(q); }, 'buddy');
  }
  let res = [];
  try { res = await call('history:suggest', q); } catch {}
  if (token !== sugToken) return;
  const lq = q.toLowerCase();
  const tabHits = tabs.filter((t) => t.id !== activeId && !isInternal(t.url) && ((t.title || '').toLowerCase().includes(lq) || t.url.toLowerCase().includes(lq))).slice(0, 3);
  for (const t of tabHits) row(t.favicon || I.tab, title(t), 'Switch to this tab', () => { addr.blur(); activate_(t.id); });
  for (const r of res.slice(0, 7)) if (r.url !== go) row(faviconFor(r.url) || I.clock, r.title || r.url, prettyUrl(r.url), () => { addr.blur(); navigate(r.url); });
}
const faviconFor = (u) => { const h = hostOf(u); return h ? `https://${h}/favicon.ico` : null; };

/* ---------------- tab grid ---------------- */
const thumbs = new Map();
async function snap(t) {
  if (!t || !t.wv || !t.ready || t.id !== activeId) return;
  try { const b64 = await call('android:shot', t.wv.getWebContentsId()); if (b64) thumbs.set(t.id, 'data:image/jpeg;base64,' + b64); } catch {}
}
async function openGrid() {
  hideSheet(true);
  await snap(active());
  const w = await call('android:windows').catch(() => ({}));
  $('segTabs').classList.toggle('on', !info.incognito); $('segPrivate').classList.toggle('on', !!info.incognito);
  renderGrid(); $('grid').classList.remove('hidden');
  const a = document.querySelector('.card.active'); if (a) a.scrollIntoView({ block: 'center' });
  void w;
}
function closeGrid() { $('grid').classList.add('hidden'); }
function renderGrid() {
  const box = $('cards'); box.replaceChildren();
  if (!tabs.length) { box.appendChild(el('div', 'grid-empty', info.incognito ? 'No private tabs.' : 'No tabs open.')); return; }
  for (const t of tabs) {
    const c = el('div', 'card' + (t.id === activeId ? ' active' : ''));
    const h = el('div', 'ch');
    if (t.favicon && !isInternal(t.url)) { const img = el('img'); img.src = t.favicon; img.onerror = () => img.replaceWith(el('span', 'fdot')); h.appendChild(img); } else h.appendChild(el('span', 'fdot'));
    h.appendChild(el('span', 'ct', title(t)));
    const x = el('button', 'cx'); x.appendChild(icon(I.x)); x.addEventListener('click', (e) => { e.stopPropagation(); dismiss(c, t); }); h.appendChild(x);
    const shot = el('div', 'shot'); const th = thumbs.get(t.id);
    if (th) shot.style.backgroundImage = `url("${th}")`; else { shot.classList.add('blank'); shot.textContent = isNewtab(t.url) ? 'New tab' : hostOf(t.url) || title(t); }
    c.append(h, shot);
    c.addEventListener('click', () => { activate_(t.id); closeGrid(); });
    swipeAway(c, t);
    box.appendChild(c);
  }
}
function dismiss(c, t) { c.style.transform = 'translateX(110%)'; c.style.opacity = '0'; setTimeout(() => { thumbs.delete(t.id); closeTab(t.id); if (!$('grid').classList.contains('hidden')) renderGrid(); }, 200); }
// Swipe a card sideways to close it.
function swipeAway(c, t) {
  let x0 = null, y0 = 0, dx = 0, moving = false;
  c.addEventListener('pointerdown', (e) => { x0 = e.clientX; y0 = e.clientY; dx = 0; moving = false; c.style.transition = 'none'; });
  c.addEventListener('pointermove', (e) => {
    if (x0 == null) return; dx = e.clientX - x0;
    if (!moving && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(e.clientY - y0)) { moving = true; c.setPointerCapture(e.pointerId); }
    if (moving) { c.style.transform = `translateX(${dx}px)`; c.style.opacity = String(1 - Math.min(.8, Math.abs(dx) / 260)); }
  });
  const end = () => {
    if (x0 == null) return; x0 = null; c.style.transition = '';
    if (moving && Math.abs(dx) > 90) { c.style.transform = `translateX(${dx > 0 ? 110 : -110}%)`; c.style.opacity = '0'; setTimeout(() => { closeTab(t.id); renderGrid(); }, 180); }
    else { c.style.transform = ''; c.style.opacity = ''; }
    if (moving) c.addEventListener('click', (e) => e.stopImmediatePropagation(), { once: true, capture: true });
  };
  c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
}
// + : a new tab; hold it for a private tab.
{
  const nb = $('newBtn'); let holdT = 0, held = false;
  nb.addEventListener('pointerdown', () => { held = false; clearTimeout(holdT); holdT = setTimeout(() => { held = true; post({ type: 'android:haptic' }); call('android:showWindow', true); }, 450); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) nb.addEventListener(ev, () => clearTimeout(holdT));
  nb.addEventListener('click', () => { if (held) { held = false; return; } newTab(); });
  nb.addEventListener('contextmenu', (e) => e.preventDefault());
}
// Swipe down on the top bar: all your tabs.
{
  let y0 = null;
  $('bar').addEventListener('pointerdown', (e) => { y0 = document.body.classList.contains('typing') ? null : e.clientY; });
  $('bar').addEventListener('pointermove', (e) => { if (y0 != null && e.clientY - y0 > 36) { y0 = null; openGrid(); } });
  $('bar').addEventListener('pointerup', () => { y0 = null; });
}
$('gridDone').addEventListener('click', closeGrid);
$('gridNew').addEventListener('click', () => { closeGrid(); newTab(); });
$('closeAll').addEventListener('click', () => { const ids = tabs.map((t) => t.id); thumbs.clear(); for (const id of ids.slice(1)) closeTab(id); closeTab(ids[0]); closeGrid(); });
$('segPrivate').addEventListener('click', () => { if (!info.incognito) call('android:showWindow', true); });
$('segTabs').addEventListener('click', () => { if (info.incognito) call('android:showWindow', false); });

/* ---------------- bottom sheets ---------------- */
function sheet(build) {
  const body = $('sheetBody'); body.replaceChildren(); build(body);
  $('scrim').classList.remove('hidden', 'closing'); $('sheet').classList.remove('hidden', 'closing');
}
function hideSheet(now) {
  for (const id of ['sheet', 'buddy']) if (!$(id).classList.contains('hidden')) { if (now) $(id).classList.add('hidden'); else { $(id).classList.add('closing'); setTimeout(() => $(id).classList.add('hidden'), 170); } }
  if (!$('scrim').classList.contains('hidden')) { if (now) $('scrim').classList.add('hidden'); else { $('scrim').classList.add('closing'); setTimeout(() => $('scrim').classList.add('hidden'), 170); } }
  $('bdInput').blur();
}
$('scrim').addEventListener('click', () => hideSheet());
const rowBtn = (parent, ic, label, fn, note) => { const b = el('button', 'row'); b.appendChild(icon(ic)); const g = el('span', 'grow', label); b.appendChild(g); if (note) b.appendChild(el('span', 'note', note)); b.addEventListener('click', () => { hideSheet(); fn(); }); parent.appendChild(b); return b; };
const internal = (name, hash = '') => { const u = 'stupid://' + name + '/' + hash; const t = tabs.find((x) => x.url.startsWith('stupid://' + name + '/')); if (t) { activate_(t.id); if (hash) t.wv && t.wv.loadURL(u); } else newTab(u); };

function menu() {
  const t = active();
  const bm = t && bookmarks.find((b) => b.type === 'bookmark' && b.url === t.url);
  sheet((s) => {
    const q = el('div', 'quick');
    const qb = (ic, label, fn, dis, on) => { const b = el('button'); b.appendChild(icon(ic)); b.appendChild(el('span', null, label)); b.disabled = !!dis; if (on) b.classList.add('on'); b.addEventListener('click', () => { hideSheet(); fn(); }); q.appendChild(b); };
    const tb = el('button'); tb.appendChild(el('span', 'tabs-count', tabCount())); tb.appendChild(el('span', null, tabs.length === 1 ? '1 tab' : `${tabs.length} tabs`));
    tb.addEventListener('click', () => { hideSheet(true); openGrid(); }); q.appendChild(tb);
    qb(I.back, 'Back', () => t.wv.goBack(), !(t && t.wv && t.wv.canGoBack()));
    qb(I.fwd, 'Forward', () => t.wv.goForward(), !(t && t.wv && t.wv.canGoForward()));
    qb(I.reload, 'Reload', () => t.wv && t.wv.reload(), !t);
    qb(I.star, bm ? 'Saved' : 'Bookmark', toggleBookmark, !t || isInternal(t.url), !!bm);
    s.appendChild(q);
    s.appendChild(el('div', 'sep'));
    rowBtn(s, I.plus, 'New tab', () => newTab());
    rowBtn(s, I.private, 'New private tab', () => call('android:showWindow', true));
    rowBtn(s, I.bookmarks, 'Bookmarks', () => internal('bookmarks'));
    rowBtn(s, I.history, 'History', () => internal('history'));
    rowBtn(s, I.download, 'Downloads', () => internal('downloads'));
    if (t && !isInternal(t.url)) rowBtn(s, I.share, 'Share', () => { if (navigator.share) navigator.share({ title: title(t), url: t.url }).catch(() => {}); else { call('clipboard:write', t.url); toast('Link copied'); } });
    rowBtn(s, I.find, 'Find in page', openFind);
    const z = el('div', 'row'); z.appendChild(icon(I.zoom)); z.appendChild(el('span', 'grow', 'Zoom'));
    const zb = el('div', 'zoom'); const lbl = el('span', null, Math.round(((t && t.zoom) || 1) * 100) + '%');
    const step = (d) => { const cur = (t && t.zoom) || 1, Z = [.5, .67, .75, .8, .9, 1, 1.1, 1.25, 1.5, 1.75, 2]; const next = d > 0 ? Z.find((v) => v > cur + .001) || 2 : [...Z].reverse().find((v) => v < cur - .001) || .5; t.zoom = next; t.wv && t.wv.setZoomFactor(next); lbl.textContent = Math.round(next * 100) + '%'; };
    const minus = el('button', null, '−'); minus.addEventListener('click', () => step(-1)); const plus = el('button', null, '+'); plus.addEventListener('click', () => step(1));
    zb.append(minus, lbl, plus); z.appendChild(zb); s.appendChild(z);
    s.appendChild(el('div', 'sep'));
    rowBtn(s, I.brush, 'Customize', () => internal('newtab', '#customize'));
    rowBtn(s, I.gear, 'Settings', () => internal('settings'));
  });
}
$('menuBtn').addEventListener('click', menu);

function toggleBookmark() {
  const t = active(); if (!t || isInternal(t.url)) return;
  const bm = bookmarks.find((b) => b.type === 'bookmark' && b.url === t.url);
  if (bm) { bookmarks = bookmarks.filter((b) => b !== bm); call('bookmarks:set', bookmarks); toast('Bookmark removed'); }
  else { bookmarks = [...bookmarks, { id: 'b' + Date.now().toString(36), type: 'bookmark', title: title(t), url: t.url, favicon: t.favicon || null, parentId: null, ts: Date.now() }]; call('bookmarks:set', bookmarks); toast('Bookmarked', { label: 'Undo', fn: toggleBookmark }); }
}

$('shieldBtn').addEventListener('click', () => sheet((s) => {
  s.appendChild(el('div', 'sh-title', 'Shield'));
  s.appendChild(el('div', 'sh-sub', 'Blocks ads and trackers on every site, so pages load faster and follow you less.'));
  if (shield.on) { s.appendChild(el('div', 'big-count', String(shield.count))); s.appendChild(el('div', 'sh-sub', 'ads and trackers blocked so far')); }
  const r = el('button', 'row'); r.appendChild(icon(I.shield)); r.appendChild(el('span', 'grow', shield.on ? 'Shield is on' : 'Shield is off'));
  const sw = el('span', 'switch' + (shield.on ? ' on' : '')); r.appendChild(sw);
  r.addEventListener('click', async () => { shield = await call('adblock:set', !shield.on); renderShield(); sw.classList.toggle('on', !!shield.on); r.querySelector('.grow').textContent = shield.on ? 'Shield is on' : 'Shield is off'; const t = active(); if (t && t.wv && !isInternal(t.url)) t.wv.reload(); });
  s.appendChild(r);
}));

$('siteBtn').addEventListener('click', () => {
  const t = active();
  if (!t || isNewtab(t.url) || isInternal(t.url) || document.body.classList.contains('typing')) { addr.focus(); return; }
  const secure = /^https:/.test(t.url);
  sheet((s) => {
    s.appendChild(el('div', 'sh-title', hostOf(t.url)));
    s.appendChild(el('div', 'sh-sub', secure ? 'Your connection to this site is private.' : 'This site isn’t secure. Don’t enter passwords or card details here.'));
    rowBtn(s, I.copy, 'Copy link', () => { call('clipboard:write', t.url); toast('Link copied'); });
    rowBtn(s, I.trash, 'Clear this site’s data', async () => { let o = ''; try { o = new URL(t.url).origin; } catch {} await call('site:clearData', o).catch(() => {}); toast('Site data cleared — you’re signed out there'); t.wv && t.wv.reload(); });
    rowBtn(s, I.gear, 'Site permissions', () => internal('settings', '#privacy'));
  });
});

/* ---------------- holding a link or picture in a page ---------------- */
window.__androidPageMenu = (m) => {
  const { link = '', src = '', media = 'none' } = m;
  const target = /^(https?|stupid):/.test(link) ? link : src;
  if (!target) return;
  sheet((s) => {
    s.appendChild(el('div', 'sh-sub', target.replace(/^https?:\/\/(www\.)?/, '').slice(0, 120)));
    if (link) {
      rowBtn(s, I.plus, 'Open in new tab', () => openUrl(link, 'background', activeId));
      rowBtn(s, I.private, 'Open in private tab', () => call('win:new', { incognito: true, url: link }));
      rowBtn(s, I.copy, 'Copy link', () => { call('clipboard:write', link); toast('Link copied'); });
      rowBtn(s, I.share, 'Share link', () => navigator.share ? navigator.share({ url: link }).catch(() => {}) : null);
      rowBtn(s, I.download, 'Download link', () => post({ type: 'android:save', url: link, tab: m.tab }));
    }
    if (media === 'image' && src) {
      if (link) s.appendChild(el('div', 'sep'));
      rowBtn(s, I.open, 'Open image in new tab', () => openUrl(src, 'background', activeId));
      rowBtn(s, I.download, 'Download image', () => post({ type: 'android:save', url: src, tab: m.tab }));
    }
  });
};
window.__androidPopup = () => {};

/* ---------------- find in page ---------------- */
function openFind() { const f = $('find'); f.classList.remove('hidden'); $('findInput').value = ''; $('findCount').textContent = '0/0'; setTimeout(() => $('findInput').focus(), 50); }
function closeFind() { const t = active(); if (t && t.wv) t.wv.stopFindInPage('clearSelection'); $('find').classList.add('hidden'); $('findInput').blur(); }
$('findInput').addEventListener('input', () => { const t = active(); if (t && t.wv) t.wv.findInPage($('findInput').value); });
$('findInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const t = active(); t && t.wv && t.wv.findInPage($('findInput').value, { forward: true }); } });
$('findNext').addEventListener('click', () => { const t = active(); t && t.wv && $('findInput').value && t.wv.findInPage($('findInput').value, { forward: true }); });
$('findPrev').addEventListener('click', () => { const t = active(); t && t.wv && $('findInput').value && t.wv.findInPage($('findInput').value, { forward: false }); });
$('findClose').addEventListener('click', closeFind);

/* ---------------- Buddy ---------------- */
let bdStatus = { ready: false }, bdBusy = false, bdCurrent = null, bdLook = true;
const ballEl = $('bdBall');
function face(state) { ballEl.className = 'ball' + (state ? ' ' + state : ''); }
setInterval(() => { if (!$('buddy').classList.contains('hidden') && !bdBusy && !ballEl.classList.contains('sleepy')) { face('blink'); setTimeout(() => face(bdStatus.ready ? '' : 'sleepy'), 140); } }, 3800);
async function refreshBuddy() {
  try { bdStatus = await call('buddy:status'); } catch { bdStatus = { ready: false }; }
  $('bdName').textContent = buddyName();
  $('bdModel').textContent = bdStatus.ready ? `${String(bdStatus.providerName || '').replace(/ \(.*\)/, '')} · ${bdStatus.modelName || ''}` : 'Not set up yet';
  $('bdInput').placeholder = `Ask ${buddyName()}…`;
  face(bdStatus.ready ? '' : 'sleepy');
}
function md(text) {   // light markdown: paragraphs, **bold**, `code`, lists, safe links
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const inline = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
  const out = []; let list = null;
  for (const line of text.split('\n')) {
    const m = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (m) { if (!list) { list = /^\s*\d/.test(line) ? 'ol' : 'ul'; out.push(`<${list}>`); } out.push(`<li>${inline(m[1])}</li>`); continue; }
    if (list) { out.push(`</${list}>`); list = null; }
    if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push(`</${list}>`);
  return out.join('');
}
function bubble(who, text) { const b = el('div', 'msg ' + who); if (who === 'bot') b.innerHTML = md(text); else b.textContent = text; $('bdLog').appendChild(b); $('bdLog').scrollTop = 1e9; return b; }
function bdNote(text, action) { const n = el('div', 'bd-note', text); if (action) { const b = el('button', null, action.label); b.addEventListener('click', action.fn); n.appendChild(b); } $('bdLog').appendChild(n); $('bdLog').scrollTop = 1e9; }
function greet() {
  $('bdLog').replaceChildren();
  if (!bdStatus.ready) {
    bubble('bot', `Hi! I’m **${buddyName()}**. I can read the page you’re on and answer questions about it.\n\nPick an AI for me (Claude, ChatGPT, Gemini…) to wake me up.`);
    bdNote('', { label: 'Set me up', fn: () => { hideSheet(); internal('settings', '#buddy'); } });
  } else bubble('bot', `Hi! Ask me anything. With the 👁 on, I can see the page you’re on.`);
  chips();
}
function chips() {
  const box = $('bdChips'); box.replaceChildren();
  const t = active();
  if (!bdStatus.ready || !t || !/^https?:/.test(t.url)) return;
  for (const [label, q] of [['Summarize this page', 'Summarize this page in a few short points.'], ['Key points', 'What are the most important things on this page?'], ['Explain simply', 'Explain this page simply, like I’m new to the topic.']]) {
    const c = el('button', 'chip', label); c.addEventListener('click', () => ask(q, true)); box.appendChild(c);
  }
}
const ERR = { nokey: 'Add your API key in Settings → AI buddy first.', badkey: 'That API key didn’t work. Check it in Settings.', ratelimit: 'Too many requests right now. Try again in a moment.',
  offline: 'I can’t reach the internet right now.', nomodel: 'Pick a model in Settings → AI buddy first.', disabled: 'Buddy is turned off in Settings.', refusal: 'I can’t help with that one.', ollama: 'Ollama isn’t reachable from this phone.' };
async function ask(text, forceLook) {
  text = String(text || $('bdInput').value).trim();
  if (!text || bdBusy) return;
  if (!bdStatus.ready) await refreshBuddy();
  if (!bdStatus.ready) { greet(); return; }
  $('bdInput').value = ''; grow(); $('bdChips').replaceChildren();
  bubble('me', text);
  const t = active();
  const look = (forceLook || bdLook) && t && t.wv && t.ready && /^https?:/.test(t.url) && !info.incognito;
  if (look) bdNote('Looking at “' + title(t).slice(0, 50) + '”');
  bdCurrent = bubble('bot', ''); bdCurrent.classList.add('typing'); bdCurrent.__text = '';
  busy(true);
  let res;
  try { res = await call('buddy:ask', { text, look, tabWcId: look ? t.wv.getWebContentsId() : null }); } catch { res = { ok: false, error: 'api' }; }
  busy(false);
  bdCurrent.classList.remove('typing');
  if (!res.ok) {
    if (!bdCurrent.__text) bdCurrent.remove();
    const msg = res.error === 'model' ? `This AI doesn’t offer the model “${res.detail}”.` : ERR[res.error] || (['stopped', 'busy', 'empty'].includes(res.error) ? '' : 'Something went wrong. Try again.');
    if (msg) bdNote(msg, ['nokey', 'badkey', 'nomodel', 'model'].includes(res.error) ? { label: 'Open settings', fn: () => { hideSheet(); internal('settings', '#buddy'); } } : null);
  }
  bdCurrent = null; chips();
}
api.on('buddy:delta', (d) => {
  if (!bdCurrent) return;
  bdCurrent.classList.remove('typing'); bdCurrent.__text += d; bdCurrent.innerHTML = md(bdCurrent.__text); $('bdLog').scrollTop = 1e9;
  face('talking'); clearTimeout(talkT); talkT = setTimeout(() => face(bdBusy ? 'thinking' : 'happy'), 350);
});
let talkT;
function busy(b) {
  bdBusy = b; $('bdSend').replaceChildren(icon(b ? I.stop : I.send));
  if (b) face('thinking'); else { face('happy'); setTimeout(() => !bdBusy && face(''), 1600); }
}
const grow = () => { const i = $('bdInput'); i.style.height = 'auto'; i.style.height = Math.min(120, i.scrollHeight) + 'px'; };
$('bdInput').addEventListener('input', grow);
$('bdInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } });
$('bdForm').addEventListener('submit', (e) => { e.preventDefault(); if (bdBusy) call('buddy:stop'); else ask(); });
$('bdLook').addEventListener('click', () => { bdLook = !bdLook; $('bdLook').classList.toggle('on', bdLook); toast(bdLook ? `${buddyName()} can see this page` : `${buddyName()} won’t look at the page`); call('settings:set', { buddy: Object.assign({}, settings.buddy, { look: bdLook }) }); });
$('bdNew').addEventListener('click', () => { call('buddy:reset'); greet(); toast('Started a new chat'); });
$('bdClose').addEventListener('click', () => hideSheet());
async function openBuddy(question) {
  hideSheet(true);
  await refreshBuddy();
  if (!$('bdLog').children.length) greet(); else chips();
  $('scrim').classList.remove('hidden', 'closing'); $('buddy').classList.remove('hidden', 'closing');
  if (question) ask(question); else if (bdStatus.ready) setTimeout(() => $('bdInput').focus(), 250);
}
$('buddyBtn').addEventListener('click', () => openBuddy());

// Selected text in a page: "Ask <name> about this" (the page's own copy menu stays as it is).
let sel = null, selT;
function onSelection(s) {
  clearTimeout(selT);
  const pill = $('selPill');
  if (!s || !s.text || (settings.buddy && settings.buddy.enabled === false)) { selT = setTimeout(() => pill.classList.add('hidden'), 150); sel = null; return; }
  sel = s.text;
  pill.lastChild.textContent = `Ask ${buddyName()} about this`;
  pill.classList.remove('hidden');
}
$('selPill').addEventListener('click', () => { $('selPill').classList.add('hidden'); if (sel) openBuddy(`Explain this: “${sel.slice(0, 1500)}”`); });

/* ---------------- Android's back gesture ---------------- */
window.__androidBack = () => {
  if (!$('buddy').classList.contains('hidden') || !$('sheet').classList.contains('hidden')) { hideSheet(); return 'ui'; }
  if (!$('grid').classList.contains('hidden')) { closeGrid(); return 'ui'; }
  if (!$('find').classList.contains('hidden')) { closeFind(); return 'ui'; }
  if (document.body.classList.contains('typing')) { addr.blur(); return 'ui'; }
  if (!$('selPill').classList.contains('hidden')) { $('selPill').classList.add('hidden'); return 'ui'; }
  return '';
};

/* ---------------- the bar's height (it slides away while a page scrolls) ---------------- */
function reportBars() { post({ type: 'android:bars', h: Math.round($('bar').getBoundingClientRect().bottom) }); }
new ResizeObserver(reportBars).observe($('bar'));

/* ---------------- events from the core and the app ---------------- */
api.on('open-url', ({ url, where, opener }) => openUrl(url, where, opener));
api.on('settings:changed', (s) => { settings = s; applySettings(); });
api.on('bookmarks:changed', (b) => { bookmarks = b; });
api.on('adblock:count', (n) => { shield.count = n; renderShield(); });
api.on('downloads:started', (d) => toast(`Downloading ${d.filename}`));
api.on('downloads:update', (d) => { if (d.state === 'completed') toast(`Downloaded ${d.filename}`, { label: 'Open', fn: () => call('downloads:action', d.id, 'open') }); });
api.on('perm:prompt', (p) => {
  let host = p.origin; try { host = new URL(p.origin).host; } catch {}
  const KIND = { camera: 'Use your camera', microphone: 'Use your microphone', location: 'Know your location', notifications: 'Show notifications' };
  sheet((s) => {
    s.appendChild(el('div', 'sh-title', `${host} wants to`));
    s.appendChild(el('div', 'sh-sub', p.kinds.map((k) => KIND[k] || k).join(' · ')));
    const r = el('div', 'btn-row'); const no = el('button', 'btn', 'Block'), yes = el('button', 'btn solid', 'Allow');
    no.addEventListener('click', () => { call('perm:respond', p.id, false, true); hideSheet(); }); yes.addEventListener('click', () => { call('perm:respond', p.id, true, true); hideSheet(); });
    r.append(no, yes); s.appendChild(r);
  });
});
api.on('pw:offer', (p) => {
  let host = p.origin; try { host = new URL(p.origin).host; } catch {}
  sheet((s) => {
    s.appendChild(el('div', 'sh-title', p.update ? 'Update password?' : 'Save password?'));
    s.appendChild(el('div', 'sh-sub', `For ${host}` + (p.username ? ` as ${p.username}` : '') + '. Encrypted on this phone.'));
    const r = el('div', 'btn-row'); const no = el('button', 'btn', 'Not now'), yes = el('button', 'btn solid', 'Save');
    no.addEventListener('click', () => { call('pw:respond', p.id, 'dismiss'); hideSheet(); }); yes.addEventListener('click', () => { call('pw:respond', p.id, 'save'); hideSheet(); toast('Password saved'); });
    r.append(no, yes); s.appendChild(r);
  });
});

function applySettings() {
  const acc = ACCENTS[settings.accent] || (/^#[0-9a-f]{6}$/i.test(settings.accent || '') ? settings.accent : ACCENTS.clay);
  document.documentElement.style.setProperty('--accent', acc);
  document.documentElement.style.setProperty('--accent-soft', acc + '24');
  bdLook = !(settings.buddy && settings.buddy.look === false); $('bdLook').classList.toggle('on', bdLook);
  $('buddyBtn').classList.toggle('hidden', !!(settings.buddy && settings.buddy.enabled === false));
  addr.placeholder = `Search ${engineName()} or type an address`;
}

/* ---------------- start ---------------- */
(async () => {
  info = await call('win:info');
  if (info.incognito) document.body.classList.add('incognito');
  settings = await call('settings:get');
  bookmarks = await call('bookmarks:get').catch(() => []);
  applySettings();
  shield = await call('adblock:get').catch(() => shield); renderShield();
  const r = info.restore;
  if (r && r.tabs && r.tabs.length) {
    const act = Math.min(r.active || 0, r.tabs.length - 1);
    r.tabs.forEach((t, i) => newTab(t.url, { activate: false, lazy: i !== act, title: t.title, favicon: t.favicon }));
    activate_(tabs[act].id);
  }
  if (info.urls && info.urls.length) info.urls.forEach((u, i) => newTab(u, { activate: i === 0 }));
  else if (!tabs.length) newTab();
  queueSpare(2500);
  refreshBuddy();
  reportBars();
})();
