'use strict';
/* Stupid Search (stupid://search/?q=…): web results from DuckDuckGo fetched by the browser itself (src/search-main.js),
   an instant answer worked out on this computer (search-answers.js), a Wikipedia card, and the matching pages from
   your own bookmarks and history. */
(() => {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const q0 = (new URLSearchParams(location.search).get('q') || '').replace(/\s+/g, ' ').trim();
  const enc = encodeURIComponent;
  let settings = {};
  const buddyName = () => ((settings.buddyLook && settings.buddyLook.name) || 'Buddy').slice(0, 20);
  let next = null, loading = false;

  /* ---------- the search box ---------- */
  const box = $('q');
  box.value = q0;
  $('clear').classList.toggle('hidden', !q0);
  box.addEventListener('input', () => $('clear').classList.toggle('hidden', !box.value));
  $('clear').onclick = () => { box.value = ''; $('clear').classList.add('hidden'); box.focus(); };
  $('form').addEventListener('submit', (e) => { e.preventDefault(); const q = box.value.replace(/\s+/g, ' ').trim(); if (q) location.href = 'stupid://search/?q=' + enc(q); });
  document.addEventListener('keydown', (e) => { if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && document.activeElement !== box) { e.preventDefault(); box.focus(); box.select(); } });

  /* ---------- where else to look: images, videos, news, maps, Buddy ---------- */
  const TABS = (q) => [
    { name: 'Web', url: 'stupid://search/?q=' + enc(q), on: true, icon: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>' },
    { name: 'Images', url: 'https://duckduckgo.com/?q=' + enc(q) + '&iax=images&ia=images', icon: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 16l5-5 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.5"/>' },
    { name: 'Videos', url: 'https://www.youtube.com/results?search_query=' + enc(q), icon: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9l5 3-5 3z"/>' },
    { name: 'News', url: 'https://duckduckgo.com/?q=' + enc(q) + '&iar=news&ia=news', icon: '<path d="M4 5h16v14H4zM8 9h8M8 13h8M8 17h5"/>' },
    { name: 'Maps', url: 'https://www.openstreetmap.org/search?query=' + enc(q), icon: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14"/>' }
  ];
  function renderTabs(q) {
    const nav = $('tabs'); nav.replaceChildren();
    if (!q) { nav.classList.add('hidden'); return; }
    nav.classList.remove('hidden');
    for (const t of TABS(q)) { const a = el('a', t.on ? 'on' : ''); a.href = t.url; a.appendChild(icon(t.icon)); a.appendChild(document.createTextNode(t.name)); nav.appendChild(a); }
    if (!(settings.buddy && settings.buddy.enabled === false)) {
      const a = el('a', 'buddy'); a.href = 'stupid://ask/?q=' + enc(q); a.title = `${buddyName()} reads the best pages and answers with sources`;
      a.innerHTML = '<span class="ball" aria-hidden="true"></span>'; a.appendChild(document.createTextNode(`Ask ${buddyName()}`));
      nav.appendChild(a);
    }
  }

  /* ---------- results ---------- */
  function siteLine(url) {
    let host = '', path = '';
    try { const u = new URL(url); host = u.hostname.replace(/^www\./, ''); path = decodeURIComponent(u.pathname + u.search); } catch { path = ''; }   // a bad escape in the address: just no crumbs
    path = path.replace(/\/$/, ''); if (path.length > 60) path = path.slice(0, 57) + '…';
    const s = el('span', 'ss-site');
    const img = el('img'); img.alt = ''; img.src = 'https://icons.duckduckgo.com/ip3/' + esc(host) + '.ico'; img.onerror = () => img.remove();
    s.appendChild(img); s.appendChild(el('span', 'host', host)); if (path && path !== '/') s.appendChild(el('span', 'path', path.replace(/^\//, '› ').replace(/\//g, ' › ')));
    return s;
  }
  const words = (q) => [...new Set(q.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1))];
  function highlight(text, q) {
    const ws = words(q).filter((w) => w.length > 2); if (!ws.length) return esc(text);
    const re = new RegExp('(' + ws.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'giu');
    return String(text).split(re).map((part, i) => (i % 2 ? '<b>' + esc(part) + '</b>' : esc(part))).join('');
  }
  function addResults(results, q) {
    const list = $('list'); const start = list.children.length;
    results.forEach((r, i) => { try {
      const li = el('li'); li.style.animationDelay = Math.min(i, 12) * 25 + 'ms';
      li.appendChild(siteLine(r.url));
      const a = el('a', 'ss-title', r.title); a.href = r.url; li.appendChild(a);
      if (r.snippet) { const p = el('p', 'ss-snippet'); p.innerHTML = highlight(r.snippet, q); li.appendChild(p); }
      list.appendChild(li);
    } catch {} });   // one odd result never takes the rest of the list with it
    return list.children.length - start;
  }
  const NOTICE = {
    blocked: { h: 'DuckDuckGo wants a human right now', p: 'It asked the browser to prove it isn’t a robot, which happens when many searches come from the same network. Open the results on DuckDuckGo instead, or try again in a minute.' },
    offline: { h: 'Can’t reach the web', p: 'The browser couldn’t get an answer from DuckDuckGo. Are you online?' },
    timeout: { h: 'That took too long', p: 'DuckDuckGo didn’t answer in time. Try again, or open the results there.' },
    http: { h: 'DuckDuckGo had a hiccup', p: 'It answered with an error instead of results. Try again in a moment, or open the results there.' },
    nobridge: { h: 'Web results aren’t in this version yet', p: 'This version of the browser can’t fetch results itself yet. Open them on DuckDuckGo instead.' },
    none: { h: 'Nothing found', p: 'No pages matched that. Try fewer or different words.' }
  };
  function notice(kind, q) {
    const n = NOTICE[kind] || NOTICE.http; const d = $('notice'); d.replaceChildren();
    d.appendChild(el('h2', null, n.h)); d.appendChild(el('p', null, n.p));
    const acts = el('div', 'acts');
    const ddg = el('a', 'btn primary', 'Open on DuckDuckGo'); ddg.href = 'https://duckduckgo.com/?q=' + enc(q); acts.appendChild(ddg);
    if (kind !== 'nobridge' && kind !== 'none') { const again = el('button', 'btn', 'Try again'); again.onclick = () => run(q); acts.appendChild(again); }
    d.appendChild(acts); d.classList.remove('hidden');
  }
  function elsewhere(q) {
    const d = $('elsewhere'); d.replaceChildren();
    d.appendChild(el('span', null, 'Try the same search on'));
    const engines = Object.entries(settings.engines || {}).filter(([k]) => k !== 'stupid');
    engines.forEach(([k, e], i) => { const a = el('a', null, e.name); a.href = e.url.replace('%s', enc(q)); d.appendChild(a); if (i < engines.length - 1) d.appendChild(document.createTextNode('·')); });
    d.classList.remove('hidden');
  }
  async function fetchWeb(q, token) {
    try { return await call('search:web', q, token); }
    catch (e) { return { error: /blocked|no bridge|isn.t in the .* version yet|No handler/i.test(String(e && e.message || e)) ? 'nobridge' : 'offline' }; }
  }
  async function run(q) {
    if (loading) return; loading = true; next = null;
    $('list').replaceChildren(); $('notice').classList.add('hidden'); $('moreWrap').classList.add('hidden');
    $('status').classList.remove('hidden'); $('statusText').textContent = 'Searching…';
    const r = await fetchWeb(q, null);
    loading = false;
    $('status').classList.add('hidden');
    if (r.error) { notice(r.error, q); elsewhere(q); return; }
    if (!r.results.length) { notice('none', q); elsewhere(q); return; }
    addResults(r.results, q);
    next = r.next; $('moreWrap').classList.toggle('hidden', !next);
    elsewhere(q);
  }
  $('more').onclick = async () => {
    if (!next || loading) return; loading = true;
    const q = q0, token = next; next = null;
    $('more').disabled = true; $('more').textContent = 'Loading…';
    const r = await fetchWeb(q, token);
    loading = false; $('more').disabled = false; $('more').textContent = 'More results';
    if (r.error) { next = token; toast('Couldn’t load more results. Try again?'); return; }   // keep the token: the next click retries
    const added = addResults(r.results || [], q);
    next = added ? r.next : null;
    $('moreWrap').classList.toggle('hidden', !next);
    if (!added) toast('That’s all DuckDuckGo had.');
  };

  /* ---------- instant answer (on this computer) ---------- */
  // Wikipedia and the instant answer both run at start; instant() goes first so wiki() can see whether there is one.
  function instant(q) {
    const a = window.searchAnswers && window.searchAnswers.answer(q);
    const d = $('answer'); if (!a) { d.classList.add('hidden'); return; }
    d.replaceChildren(el('div', 'kind', a.kind === 'sum' ? 'Answer' : 'Conversion'), el('div', 'big', a.big), el('div', 'sub', a.sub));
    d.classList.remove('hidden');
  }

  /* ---------- Wikipedia card ---------- */
  const WIKI_NAME = { en: 'Wikipedia', sv: 'Swedish Wikipedia', no: 'Norwegian Wikipedia', da: 'Danish Wikipedia', fi: 'Finnish Wikipedia', de: 'German Wikipedia', fr: 'French Wikipedia', es: 'Spanish Wikipedia', it: 'Italian Wikipedia', nl: 'Dutch Wikipedia', pl: 'Polish Wikipedia', pt: 'Portuguese Wikipedia' };
  async function wiki(q) {
    const d = $('wiki');
    if (!$('answer').classList.contains('hidden') || !/\p{L}{3}/u.test(q)) { d.classList.add('hidden'); return; }   // a sum or a number: no article wanted
    const w = await call('search:wiki', q).catch(() => null);
    // Only an article that is clearly about the query: its title shares a word with it (not a locomotive for "2^10").
    const tw = w && w.title ? words(w.title).filter((x) => x.length > 2) : [];
    const qw = words(q).filter((x) => x.length > 2);
    const about = tw.length && (tw.some((t) => qw.some((x) => x.startsWith(t.slice(0, 4)) || t.startsWith(x.slice(0, 4)))) || q.toLowerCase().includes(w.title.toLowerCase()));
    if (!w || !w.title || !about) { d.classList.add('hidden'); return; }
    d.replaceChildren();
    if (w.thumbnail) { const img = el('img'); img.src = w.thumbnail; img.alt = ''; img.onerror = () => img.remove(); d.appendChild(img); }
    const body = el('div', 'body'); body.appendChild(el('h2', null, w.title)); body.appendChild(el('p', null, w.extract));
    const a = el('a', 'from', (WIKI_NAME[w.lang] || 'Wikipedia') + ' ›'); if (/^https:\/\/[a-z]{2,3}\.wikipedia\.org\//.test(w.url)) a.href = w.url; body.appendChild(a);
    d.appendChild(body); d.classList.remove('hidden');
  }

  /* ---------- your own bookmarks and history ---------- */
  async function mine(q) {
    const ws = words(q); const d = $('mine');
    if (!ws.length) { d.classList.add('hidden'); return; }
    const [hist, bms] = await Promise.all([call('history:query', '', 2500).catch(() => []), call('bookmarks:get').catch(() => [])]);
    const hits = new Map();
    const consider = (url, title, kind, ts) => {
      if (!/^https?:\/\//.test(url || '')) return;
      const hay = ((title || '') + ' ' + url).toLowerCase();
      if (!ws.every((w) => hay.includes(w))) return;
      const key = url.replace(/[#?].*$/, '').replace(/\/$/, '');
      const prev = hits.get(key);
      if (!prev || kind === 'bookmark') hits.set(key, { url, title: title || (prev && prev.title) || url, kind: prev && prev.kind === 'bookmark' ? 'bookmark' : kind, ts: Math.max(ts || 0, prev ? prev.ts : 0) });
    };
    for (const b of bms || []) if (b.type === 'bookmark') consider(b.url, b.title, 'bookmark', b.ts);
    for (const h of hist || []) consider(h.url, h.title, 'history', h.ts);
    const top = [...hits.values()].sort((a, b) => (b.kind === 'bookmark') - (a.kind === 'bookmark') || b.ts - a.ts).slice(0, 4);
    if (!top.length) { d.classList.add('hidden'); return; }
    d.replaceChildren(el('div', 'kind', 'From your bookmarks and history'));
    for (const h of top) {
      const a = el('a'); a.href = h.url;
      const img = favImg(h.url); img.alt = '';   // the site's own icon (common.js), not an icon service that would see your bookmarks
      a.appendChild(img); a.appendChild(el('span', 't', h.title)); a.appendChild(el('span', 'h', hostOf(h.url)));
      if (h.kind === 'bookmark') a.appendChild(el('span', 'tag', 'Bookmark'));
      d.appendChild(a);
    }
    d.classList.remove('hidden');
  }

  /* ---------- home: recent searches from history ---------- */
  async function recent() {
    const hist = await call('history:query', 'stupid://search/?q=', 200).catch(() => []);
    const seen = new Set(), out = [];
    for (const h of hist || []) {
      let q = ''; try { q = new URL(h.url).searchParams.get('q') || ''; } catch {}
      q = q.trim(); if (!q || seen.has(q.toLowerCase())) continue;
      seen.add(q.toLowerCase()); out.push(q); if (out.length >= 6) break;
    }
    if (!out.length) return;
    const list = $('recentList'); list.replaceChildren();
    for (const q of out) { const a = el('a', 'ss-chip', q); a.href = 'stupid://search/?q=' + enc(q); a.title = q; list.appendChild(a); }
    $('recent').classList.remove('hidden');
  }

  /* ---------- go ---------- */
  async function start() {
    settings = await call('settings:get').catch(() => ({}));
    renderTabs(q0);
    if (!q0) { $('home').classList.remove('hidden'); $('results').classList.add('hidden'); box.focus(); recent(); return; }
    document.title = q0 + ' · Stupid Search';
    $('home').classList.add('hidden'); $('results').classList.remove('hidden');
    instant(q0);
    run(q0); wiki(q0); mine(q0);
  }
  S.on('settings:changed', (s) => { settings = s || settings; renderTabs(q0); });
  start();
})();
