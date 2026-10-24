'use strict';
/* Buddy Net renderer: tabs, the era switcher (Time Machine), Wayback routing, Labs and the AI sidebar. */

const ERAS = [
  { id: 'nineties', label: '90s', name: 'Buddy Net Navigator', years: [1996, 1999], year: 1997, tabs: false,
    addressLabel: 'Location:', search: 'https://html.duckduckgo.com/html/?q=', bg: '#c0c0c0' },
  { id: 'explorer', label: '2000s', name: 'Buddy Net Explorer', years: [2000, 2005], year: 2002, tabs: false,
    addressLabel: 'Address', search: 'https://html.duckduckgo.com/html/?q=', bg: '#ece9d8' },
  { id: 'chrome', label: 'Early Chrome', name: 'Buddy Net Chrome', years: [2006, 2009], year: 2008, tabs: true,
    addressLabel: '', search: 'https://duckduckgo.com/?q=', bg: '#d6e3f5' },
  { id: 'labs', label: '2010s Labs', name: 'Buddy Net Labs', years: [2010, 2016], year: 2012, tabs: true,
    addressLabel: '', search: 'https://duckduckgo.com/?q=', bg: '#f2f2f2' },
  { id: 'ai', label: 'AI 2020s', name: 'Buddy Net AI', years: [2020, 2026], year: 2026, tabs: true, live: true,
    addressLabel: '', search: 'https://duckduckgo.com/?q=', bg: '#121218' }
];
const HOME = 'buddynet://home';
const $ = (id) => document.getElementById(id);

const state = {
  era: ERAS[0],
  years: Object.fromEntries(ERAS.map((e) => [e.id, e.year])),
  timeTravel: true, sounds: true, hasKey: false,
  exps: { filter: false, tilt: false, night: false, social: true, skeuo: false },
  imagesOff: false, dialedUp: false, blockedPopup: null
};
const tabs = [];
let active = null;
let nextId = 1;

/* ---------- URLs and the Wayback Machine ---------- */
const WAYBACK_RE = /^https?:\/\/web\.archive\.org\/web\/(\d{4,14})(?:[a-z]{2}_)?\/(.+)$/i;
function stamp() { return `${state.years[state.era.id]}0701`; }
function travelling() { return state.timeTravel && !state.era.live; }
function toWayback(url) { return `https://web.archive.org/web/${stamp()}if_/${url}`; }
function fromWayback(url) {
  const m = WAYBACK_RE.exec(url || '');
  if (!m) return null;
  let orig = m[2];
  if (!/^https?:\/\//i.test(orig)) orig = 'http://' + orig.replace(/^\/+/, '');
  return { orig, ts: m[1] };
}
function homeUrl() {
  const q = new URLSearchParams({ era: state.era.id, year: state.years[state.era.id], tt: travelling() ? '1' : '0' });
  return `pages/home.html?${q}`;
}
function isHome(url) { return /\/pages\/home\.html/.test(url || ''); }
function failedUrl(url) { return isHome(url) ? new URL(url).searchParams.get('fail') : null; }
function displayUrl(url) {
  if (failedUrl(url)) return failedUrl(url);
  if (!url || isHome(url)) return state.era.id === 'nineties' || state.era.id === 'explorer' ? HOME : '';
  const wb = fromWayback(url);
  return wb ? wb.orig : url;
}
function originalUrl(url) {
  if (failedUrl(url)) return failedUrl(url);
  if (!url || isHome(url)) return HOME;
  const wb = fromWayback(url);
  return wb ? wb.orig : url;
}
// What a typed address or link should load in the current era.
function resolve(input) {
  const text = String(input || '').trim();
  if (!text || text === HOME || text === 'home') return homeUrl();
  let url = null;
  if (/^https?:\/\//i.test(text)) url = text;
  else if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(text) && !/\s/.test(text)) url = 'http://' + text;
  if (!url) return state.era.search + encodeURIComponent(text);
  if (needsTravel(url) && !fromWayback(url)) return toWayback(url);
  return url;
}
// Search engines and the archive itself always load live; everything else gets sent back in time.
function needsTravel(url) {
  if (!travelling() || !/^https?:/i.test(url)) return false;
  return !/^https?:\/\/([\w-]+\.)*(archive\.org|duckduckgo\.com)\//i.test(url);
}
function ddgTarget(url) {
  try {
    const u = new URL(url);
    if (/duckduckgo\.com$/.test(u.hostname) && u.pathname === '/l/') return u.searchParams.get('uddg');
  } catch {}
  return null;
}

/* ---------- Tabs ---------- */
function createTab(input, focus = true) {
  const wv = document.createElement('webview');
  wv.setAttribute('allowpopups', '');
  wv.setAttribute('partition', 'persist:buddynet');
  const tab = { id: nextId++, wv, title: 'New Tab', loading: false, el: null };
  wv.src = abs(resolve(input));
  tab.eraKey = eraKey();
  $('views').appendChild(wv);
  tabs.push(tab);

  const el = document.createElement('div');
  el.className = 'tab';
  el.innerHTML = '<span class="tab-icon"></span><span class="tab-title"></span><button class="tab-x" title="Close tab">&#215;</button>';
  el.addEventListener('mousedown', (e) => { if (e.button === 1) { e.preventDefault(); closeTab(tab); } });
  el.addEventListener('click', (e) => { if (e.target.classList.contains('tab-x')) closeTab(tab); else activate(tab); });
  tab.el = el;
  $('tabs').appendChild(el);

  // Some archived pages redirect to their live address; after two bounces in a few seconds, give up.
  const guard = (url) => {
    const target = ddgTarget(url) || url;
    if (!needsTravel(target)) return false;
    const now = Date.now(), g = tab.guard;
    tab.guard = g && g.target === target && now - g.time < 5000 ? { target, time: g.time, count: g.count + 1 } : { target, time: now, count: 1 };
    wv.stop();
    if (tab.guard.count > 2) showFail(target, 'the archived page kept redirecting to the live site', true);
    else wv.src = toWayback(target);
    return true;
  };
  const showFail = (url, why, archive) => {
    const q = new URLSearchParams({ fail: url, why, archive: archive ? '1' : '0' });
    wv.src = abs(`${homeUrl()}&${q}`);
  };
  wv.addEventListener('will-navigate', (e) => guard(e.url));
  wv.addEventListener('did-redirect-navigation', (e) => { if (e.isMainFrame) guard(e.url); });
  wv.addEventListener('did-start-navigation', (e) => { if (e.isMainFrame && !e.isInPlace) tab.title = ''; });
  wv.addEventListener('did-start-loading', () => { tab.loading = true; onTabUpdate(tab); });
  wv.addEventListener('did-stop-loading', () => { tab.loading = false; onTabUpdate(tab); });
  wv.addEventListener('did-navigate', () => { onTabUpdate(tab); applyPageTweaks(tab); });
  wv.addEventListener('did-navigate-in-page', (e) => {
    const m = /#ask=([^&]*)/.exec(e.url);
    if (m && tab === active) { openAI(true); ask(decodeURIComponent(m[1])); }
    onTabUpdate(tab);
  });
  wv.addEventListener('page-title-updated', (e) => { tab.title = e.title; onTabUpdate(tab); });
  wv.addEventListener('dom-ready', () => applyPageTweaks(tab));
  wv.addEventListener('did-fail-load', (e) => {
    if (!e.isMainFrame || e.errorCode === -3) return;
    // Show an era-styled "couldn't connect" page instead of a blank one.
    showFail(originalUrl(e.validatedURL), e.errorDescription, !!fromWayback(e.validatedURL));
  });
  wv.addEventListener('update-target-url', (e) => { if (tab === active) status(e.url ? displayUrl(e.url) : doneText()); });

  if (focus || !active) activate(tab);
  else onTabUpdate(tab);
  return tab;
}

function closeTab(tab) {
  const i = tabs.indexOf(tab);
  if (i < 0) return;
  tabs.splice(i, 1);
  tab.wv.remove();
  tab.el.remove();
  if (!tabs.length) { createTab(HOME); return; }
  if (active === tab) activate(tabs[Math.min(i, tabs.length - 1)]);
}

function activate(tab) {
  active = tab;
  for (const t of tabs) {
    t.wv.classList.toggle('active', t === tab);
    t.el.classList.toggle('active', t === tab);
  }
  refreshChrome();
}

function onTabUpdate(tab) {
  const url = tab.wv.getURL ? safe(() => tab.wv.getURL(), '') : '';
  tab.el.querySelector('.tab-title').textContent = tabTitle(tab, url);
  tab.el.classList.toggle('loading', tab.loading);
  if (tab === active) refreshChrome();
}
const FAIL_TITLES = { nineties: 'Unable to connect', explorer: 'The page cannot be displayed', chrome: 'This webpage is not available', labs: 'Oops! This page went offline.', ai: "Buddy couldn't open that page" };
// A failed load leaves its own history entry right before the error page; Back skips over it.
function goBack() {
  const wv = active.wv;
  if (failedUrl(safe(() => wv.getURL(), ''))) { if (wv.canGoToOffset(-2)) wv.goToOffset(-2); }
  else if (wv.canGoBack()) wv.goBack();
}
function canBack(wv) {
  return failedUrl(safe(() => wv.getURL(), '')) ? safe(() => wv.canGoToOffset(-2), false) : safe(() => wv.canGoBack(), false);
}
// Tab-less eras (90s, 2000s) have one page; Ctrl+T and + just go home there.
function newTab() { if (state.era.tabs) createTab(HOME); else go(HOME); }
function safe(fn, fallback) { try { return fn(); } catch { return fallback; } }
function tabTitle(tab, url) {
  if (failedUrl(url)) return FAIL_TITLES[state.era.id];
  if (isHome(url)) return state.era.live ? 'New tab' : state.era.tabs ? 'New Tab' : 'Welcome to Buddy Net';
  return tab.title || displayUrl(url) || 'Untitled';
}

function refreshChrome() {
  if (!active) return;
  const wv = active.wv;
  const url = safe(() => wv.getURL(), '');
  const title = tabTitle(active, url);
  const name = state.era.name;
  $('title').textContent = state.era.id === 'nineties' ? `${name} - [${title}]` : `${title} - ${name}`;
  document.title = $('title').textContent;
  if (document.activeElement !== $('address')) $('address').value = displayUrl(url);
  $('btn-back').disabled = !canBack(wv);
  $('btn-fwd').disabled = !safe(() => wv.canGoForward(), false);
  document.body.classList.toggle('loading', active.loading);
  $('btn-stop').disabled = !active.loading;
  const wb = fromWayback(url);
  $('site-badge').className = wb ? 'archive' : /^https:/.test(url) ? 'secure' : '';
  $('snapshot').textContent = wb ? `Snapshot: ${formatStamp(wb.ts)}` : state.era.live || travelling() ? '' : 'Live web';
  status(active.loading ? loadingText(url) : doneText());
  $('ai-pill').hidden = isHome(url) || active.loading;
}
function formatStamp(ts) {
  const y = ts.slice(0, 4), m = Number(ts.slice(4, 6) || 1), d = Number(ts.slice(6, 8) || 1);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[m - 1] || 'Jan'} ${y}`;
}
function loadingText(url) {
  const host = safe(() => new URL(originalUrl(url)).hostname, '');
  if (state.era.id === 'nineties') return host ? `Connect: Contacting host: ${host}...` : 'Connecting...';
  if (state.era.id === 'explorer') return host ? `Opening page http://${host}/...` : 'Opening page...';
  if (state.era.live) return 'Buddy is thinking...';
  return host ? `Waiting for ${host}...` : 'Loading...';
}
function doneText() {
  if (state.era.id === 'nineties') return 'Document: Done';
  if (state.era.id === 'explorer') return 'Done';
  return '';
}
function status(text) { $('status').textContent = text; }

/* ---------- Era-specific touches inside the page ---------- */
function applyPageTweaks(tab) {
  const wv = tab.wv;
  if (tab._css) { wv.removeInsertedCSS(tab._css).catch(() => {}); tab._css = null; }
  if (state.era.id === 'nineties' && state.imagesOff) {
    wv.insertCSS('img,picture,svg,video{visibility:hidden!important}').then((k) => { tab._css = k; }).catch(() => {});
  }
}
function applyLabs() {
  const on = state.era.id === 'labs';
  for (const k of Object.keys(state.exps)) document.body.classList.toggle(`exp-${k}`, on && state.exps[k]);
}

/* ---------- Time Machine ---------- */
function buildEras() {
  const box = $('eras');
  for (const era of ERAS) {
    const b = document.createElement('button');
    b.className = 'era';
    b.dataset.era = era.id;
    b.role = 'tab';
    b.innerHTML = `<span class="era-dot"></span><span>${era.label}</span>`;
    b.title = `${era.name} (${era.live ? 'today' : era.years.join('–')})`;
    b.addEventListener('click', () => setEra(era.id));
    box.appendChild(b);
  }
}

function setEra(id, { animate = true } = {}) {
  const era = ERAS.find((e) => e.id === id) || ERAS[0];
  const changed = era !== state.era;
  state.era = era;
  document.body.dataset.era = era.id;
  for (const b of document.querySelectorAll('.era')) b.classList.toggle('active', b.dataset.era === era.id);
  $('address-label').textContent = era.addressLabel;
  $('address').placeholder = era.live ? 'Ask Buddy or type a URL' : era.id === 'chrome' ? 'Search or type a URL' : '';
  $('year').textContent = era.live ? 'Today' : state.years[era.id];
  $('year-down').disabled = era.live || state.years[era.id] <= era.years[0];
  $('year-up').disabled = era.live || state.years[era.id] >= era.years[1];
  $('ai-panel').hidden = !era.live || state.aiClosed;
  $('btn-menu').textContent = era.id === 'chrome' ? '\u{1F527}' : '\u2630';
  if (era.id !== 'labs') $('labs-panel').hidden = true;
  $('infobar').hidden = true;
  applyLabs();
  window.buddy.setSettings({ era: era.id });
  if (changed && animate) warp(era.live ? 'NOW' : state.years[era.id]);
  if (changed || animate === 'year') reloadInEra();
  for (const t of tabs) onTabUpdate(t);
  refreshChrome();
}

// Re-open every tab's page as it looked in the chosen era (or the live web for the 2020s).
// Tab-less eras only show the active tab, so the hidden ones catch up when tabs come back.
function eraKey() { return `${state.era.id}:${state.years[state.era.id]}:${travelling()}`; }
function reloadInEra() {
  const key = eraKey();
  for (const t of tabs) {
    if (t.eraKey === key || (!state.era.tabs && t !== active)) continue;
    t.eraKey = key;
    t.guard = null;
    const orig = originalUrl(safe(() => t.wv.getURL(), ''));
    t.wv.src = abs(resolve(orig));
  }
  if (state.era.id === 'nineties') dialUp();
}

function setYear(delta) {
  const era = state.era;
  if (era.live) return;
  const y = Math.min(era.years[1], Math.max(era.years[0], state.years[era.id] + delta));
  if (y === state.years[era.id]) return;
  state.years[era.id] = y;
  warp(y);
  setEra(era.id, { animate: 'year' });
}

function warp(label) {
  const w = $('warp');
  $('warp-year').textContent = label;
  w.hidden = false;
  w.classList.remove('go');
  void w.offsetWidth;
  w.classList.add('go');
  clearTimeout(warp.t);
  warp.t = setTimeout(() => { w.hidden = true; }, 900);
  chime();
}

/* ---------- Sounds (synthesized, nothing copyrighted) ---------- */
let audio;
function ctx() { audio = audio || new AudioContext(); return audio; }
function tone(freq, start, dur, type = 'sine', gain = 0.05) {
  const a = ctx(), o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(gain, a.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + start); o.stop(a.currentTime + start + dur + 0.05);
}
function noise(start, dur, gain = 0.03) {
  const a = ctx(), len = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (i % 2200 < 1100 ? 1 : 0.4);
  const s = a.createBufferSource(), g = a.createGain();
  s.buffer = buf; g.gain.value = gain;
  s.connect(g).connect(a.destination);
  s.start(a.currentTime + start);
}
function dialUp() {
  if (!state.sounds || state.dialedUp) return;
  state.dialedUp = true;
  try {
    [697, 1209, 770, 1336, 852, 1477, 941, 1209].forEach((f, i) => tone(f, i * 0.09, 0.08, 'sine', 0.04));
    tone(2100, 0.9, 0.9, 'sine', 0.035);
    tone(1650, 1.85, 0.25, 'square', 0.02); tone(1200, 2.1, 0.25, 'square', 0.02);
    noise(2.4, 1.6, 0.025);
    tone(980, 2.5, 1.2, 'sawtooth', 0.012);
  } catch {}
}
function chime() {
  if (!state.sounds) return;
  try {
    const notes = { nineties: [523, 659, 784], explorer: [392, 523, 659, 784], chrome: [660, 880], labs: [523, 784, 1047], ai: [440, 554, 659, 880] }[state.era.id];
    notes.forEach((f, i) => tone(f, i * 0.07, 0.35, state.era.id === 'nineties' ? 'square' : 'sine', state.era.id === 'nineties' ? 0.015 : 0.035));
  } catch {}
}

/* ---------- Buddy AI (2020s) ---------- */
function openAI(force) {
  const panel = $('ai-panel');
  panel.hidden = force ? false : !panel.hidden;
  state.aiClosed = panel.hidden;
  if (!panel.hidden) $('ai-input').focus();
}
function bubble(text, who) {
  const p = document.createElement('div');
  p.className = `msg ${who}`;
  p.textContent = text;
  $('ai-chat').appendChild(p);
  $('ai-chat').scrollTop = $('ai-chat').scrollHeight;
  return p;
}
async function pageInfo() {
  const wv = active.wv;
  const url = safe(() => wv.getURL(), '');
  const text = isHome(url) ? '' : await wv.executeJavaScript('document.body ? document.body.innerText : ""').catch(() => '');
  return { url: originalUrl(url), title: active.title, text };
}
async function ask(question) {
  if (!question) return;
  bubble(question, 'me');
  const thinking = bubble('Thinking…', 'bot thinking');
  const page = await pageInfo();
  const res = await window.buddy.ask(question, page);
  thinking.classList.remove('thinking');
  if (res && res.text) thinking.textContent = res.text;
  else if (res && res.error) thinking.textContent = `Claude couldn't answer (${res.error}). Here's my offline take:\n\n${offlineAnswer(question, page)}`;
  else thinking.textContent = offlineAnswer(question, page);
  $('ai-chat').scrollTop = $('ai-chat').scrollHeight;
}
// A tiny extractive "AI" so the era works without an API key: frequent-word sentence scoring.
const STOP = new Set('the a an and or but of to in on for with is are was were be been it this that as at by from you your we our they their i he she his her its not have has had will can do does did so if than then there here what which who when where how all any more most other some such no nor only own same too very just also about into over after before up down out off again further once page click home menu search sign log cookie cookies privacy terms per still often many much first like'.split(' '));
function offlineAnswer(question, page) {
  // Headings and menu lines have no full stop; give them one so they don't run into the next sentence.
  const text = (page.text || '').replace(/([^.!?:\s])[ \t]*\n+/g, '$1. ').replace(/\s+/g, ' ').trim();
  if (!text) {
    return question.toLowerCase().includes('summar') || question.toLowerCase().includes('page')
      ? 'This is your Buddy Net start page. Open any site and ask me again, and I will summarize it for you.'
      : `Great question! I'm running offline, so I can only read the page you're on. Add an Anthropic API key in Time Machine settings (⚙) and I'll answer anything with Claude.`;
  }
  const sentences = text.match(/[^.!?]{25,300}[.!?]/g) || [text.slice(0, 300)];
  const freq = {};
  for (const w of text.toLowerCase().match(/[a-zåäöéü]{3,}/g) || []) if (!STOP.has(w)) freq[w] = (freq[w] || 0) + 1;
  const qWords = (question.toLowerCase().match(/[a-zåäöéü]{3,}/g) || []).filter((w) => !STOP.has(w) && !['summarize', 'explain', 'five', 'like', 'key', 'points', 'what'].includes(w));
  const scored = sentences.map((s, i) => {
    const words = s.toLowerCase().match(/[a-zåäöéü]{3,}/g) || [];
    let score = words.reduce((n, w) => n + (freq[w] || 0), 0) / Math.max(4, words.length);
    score += qWords.filter((w) => s.toLowerCase().includes(w)).length * 3;
    return { s: s.trim(), i, score };
  });
  const top = scored.sort((a, b) => b.score - a.score).slice(0, 3).sort((a, b) => a.i - b.i).map((x) => x.s);
  const topics = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w]) => w);
  const q = question.toLowerCase();
  if (q.includes('five')) return `Imagine "${page.title || 'this page'}" is a big picture book. It's mostly about ${topics.slice(0, 3).join(', ')}. The main idea: ${top[0] || ''}`;
  if (q.includes('key')) return `Key points from "${page.title || 'this page'}":\n\n• ${top.join('\n• ')}`;
  return `✨ AI Overview of "${page.title || 'this page'}"\n\n${top.join(' ')}\n\nTopics: ${topics.join(', ')}`;
}

/* ---------- Wiring ---------- */
function abs(url) { return new URL(url, location.href).href; }
function go(input) { active.wv.src = abs(resolve(input)); active.wv.focus(); }
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { t.hidden = true; }, 2200);
}
const LINKS = {
  whatsnew: 'http://www.cnn.com', whatscool: 'http://www.geocities.com', search: 'http://www.altavista.com',
  directory: 'http://www.yahoo.com', webring: 'http://www.webring.com'
};

function wire() {
  $('btn-min').onclick = () => window.buddy.minimize();
  $('btn-max').onclick = () => window.buddy.maximize();
  $('btn-close').onclick = () => window.buddy.close();
  $('titlebar').addEventListener('dblclick', (e) => { if (!e.target.closest('button, .tab')) window.buddy.maximize(); });
  $('newtab').onclick = newTab;
  $('btn-back').onclick = goBack;
  $('btn-fwd').onclick = () => active.wv.goForward();
  $('btn-reload').onclick = () => active.wv.reload();
  $('btn-stop').onclick = () => active.wv.stop();
  $('btn-home').onclick = () => go(HOME);
  $('btn-go').onclick = () => go($('address').value);
  $('btn-images').onclick = () => {
    state.imagesOff = !state.imagesOff;
    $('btn-images').classList.toggle('pressed', state.imagesOff);
    for (const t of tabs) applyPageTweaks(t);
  };
  $('btn-star').onclick = () => { $('btn-star').textContent = '★'; toast('Bookmarked. (Buddy Net forgets everything when it time-travels.)'); };
  $('btn-menu').onclick = () => toast(state.era.id === 'chrome' ? 'Buddy Net Chrome 0.2.149 (beta)' : 'Buddy Net Labs build 2012.06 — experimental');
  $('address').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const v = $('address').value.trim();
      if (state.era.live && v && !/[./:]/.test(v) && v.includes(' ')) { openAI(true); ask(v); }
      go(v);
    } else if (e.key === 'Escape') { $('address').value = displayUrl(safe(() => active.wv.getURL(), '')); $('address').blur(); }
  });
  $('address').addEventListener('focus', () => $('address').select());
  for (const b of document.querySelectorAll('[data-go]')) b.onclick = () => go(LINKS[b.dataset.go]);
  $('buddybar-go').onclick = () => go($('buddybar-q').value || 'buddy');
  $('buddybar-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('buddybar-go').click(); });
  for (const b of document.querySelectorAll('.share')) b.onclick = () => toast(`${b.dataset.share}! Shared with 0 friends.`);
  $('btn-labs').onclick = () => { $('labs-panel').hidden = !$('labs-panel').hidden; };
  for (const c of document.querySelectorAll('[data-exp]')) {
    c.onchange = () => { state.exps[c.dataset.exp] = c.checked; applyLabs(); };
  }
  $('btn-ai').onclick = () => openAI();
  $('ai-pill').onclick = () => { openAI(true); ask('Summarize this page'); };
  $('ai-close').onclick = () => openAI();
  for (const b of document.querySelectorAll('[data-ask]')) b.onclick = () => ask(b.dataset.ask);
  $('ai-form').onsubmit = (e) => { e.preventDefault(); const v = $('ai-input').value.trim(); $('ai-input').value = ''; ask(v); };
  $('year-down').onclick = () => setYear(-1);
  $('year-up').onclick = () => setYear(1);
  $('tm-settings').onclick = (e) => { e.stopPropagation(); $('settings-pop').hidden = !$('settings-pop').hidden; };
  document.addEventListener('click', (e) => { if (!e.target.closest('#settings-pop, #tm-settings')) $('settings-pop').hidden = true; });
  $('set-tt').onchange = () => { state.timeTravel = $('set-tt').checked; window.buddy.setSettings({ timeTravel: state.timeTravel }); reloadInEra(); refreshChrome(); };
  $('set-sounds').onchange = () => { state.sounds = $('set-sounds').checked; window.buddy.setSettings({ sounds: state.sounds }); };
  $('set-key').onchange = async () => {
    await window.buddy.setSettings({ apiKey: $('set-key').value.trim() });
    state.hasKey = !!$('set-key').value.trim();
    $('set-key').value = '';
    keyState();
  };
  $('infobar-close').onclick = () => { $('infobar').hidden = true; };
  $('infobar-allow').onclick = () => { $('infobar').hidden = true; if (state.blockedPopup) createTab(state.blockedPopup); };

  window.buddy.onOpenTab((url) => {
    // The 2000s had pop-up blockers and the famous yellow Information Bar; tab-less eras get it too.
    if (!state.era.tabs) {
      state.blockedPopup = url;
      $('infobar-text').textContent = state.era.id === 'explorer'
        ? 'Pop-up blocked. To see this pop-up or additional options click here...'
        : 'A new window tried to open. Buddy Net Navigator kept it closed.';
      $('infobar').hidden = false;
    } else createTab(url);
  });
  window.buddy.onMaximized((m) => document.body.classList.toggle('maximized', m));

  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 't') { e.preventDefault(); newTab(); }
    else if (mod && e.key.toLowerCase() === 'w') { e.preventDefault(); closeTab(active); }
    else if (mod && e.key.toLowerCase() === 'l') { e.preventDefault(); $('address').focus(); }
    else if (mod && e.key.toLowerCase() === 'r') { e.preventDefault(); active.wv.reload(); }
    else if (mod && e.key.toLowerCase() === 'j') { e.preventDefault(); if (state.era.live) openAI(); }
    else if (mod && e.key >= '1' && e.key <= '5') { e.preventDefault(); setEra(ERAS[Number(e.key) - 1].id); }
    else if (e.altKey && e.key === 'ArrowLeft') goBack();
    else if (e.altKey && e.key === 'ArrowRight') active.wv.goForward();
  });
}
function keyState() {
  $('key-state').textContent = state.hasKey ? 'Key saved. Buddy AI answers with Claude.' : 'No key: Buddy AI uses its offline summarizer.';
  $('ai-mode').textContent = state.hasKey ? 'Answers by Claude' : 'Offline Buddy. Add an API key under ⚙ for real Claude answers.';
}

async function start() {
  const s = await window.buddy.getSettings();
  state.timeTravel = s.timeTravel; state.sounds = s.sounds; state.hasKey = s.hasKey;
  $('set-tt').checked = state.timeTravel;
  $('set-sounds').checked = state.sounds;
  keyState();
  buildEras();
  wire();
  const era = ERAS.find((e) => e.id === s.era) || ERAS[0];
  state.era = era;
  setEra(era.id, { animate: false });
  createTab(HOME);
  if (era.id === 'nineties') dialUp();
  bubble("Hi, I'm Buddy ✨ I can summarize the page you're on, explain it simply or answer questions about it.", 'bot');
}
start();
