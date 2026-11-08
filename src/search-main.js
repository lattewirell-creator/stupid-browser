'use strict';
/* Stupid Search (stupid://search/?q=…): the browser's own results page.
   The page can't fetch other sites itself (stupid:// pages have no CORS), so the web results are fetched here, in the
   main process, from DuckDuckGo's HTML version: a plain Chrome-looking request, no cookies, no account,
   nothing stored anywhere but a short in-memory cache. Ads are dropped before the page ever sees them.
   The Wikipedia card uses Wikipedia's public API the same way. */
module.exports = function search({ app, handle }) {
  const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36', 'Accept-Language': 'en-US,en;q=0.8' };
  const timed = (ms) => AbortSignal.timeout(ms);
  const decode = (s) => String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => (+n < 0x110000 ? String.fromCodePoint(+n) : '')).replace(/&#x([0-9a-f]+);/gi, (_, n) => (parseInt(n, 16) < 0x110000 ? String.fromCodePoint(parseInt(n, 16)) : '')).replace(/&nbsp;/g, ' ').replace(/&#39;|&apos;/g, '\'').replace(/&amp;/g, '&');   // &amp; last, so &amp;lt; stays the text "&lt;"
  const strip = (html) => decode(String(html || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  const MAX_Q = 400;

  // DuckDuckGo region for the results (its "kl" parameter), from the app's language: Swedish users get Swedish
  // results first, like a Swedish search engine would.
  const REGIONS = { sv: 'se-sv', nb: 'no-no', nn: 'no-no', da: 'dk-da', fi: 'fi-fi', de: 'de-de', fr: 'fr-fr', es: 'es-es', it: 'it-it', nl: 'nl-nl', pl: 'pl-pl', pt: 'br-pt', 'en-GB': 'uk-en', 'en-AU': 'au-en', 'en-CA': 'ca-en', 'en-IE': 'ie-en', 'en-NZ': 'nz-en', 'en-IN': 'in-en' };
  const locale = () => { try { return app.getLocale() || 'en'; } catch { return 'en'; } };
  const region = () => { const l = locale(); return REGIONS[l] || REGIONS[l.split('-')[0]] || 'wt-wt'; };
  const wikiLang = () => { const l = locale().split('-')[0]; return ['sv', 'nb', 'da', 'fi', 'de', 'fr', 'es', 'it', 'nl', 'pl', 'pt'].includes(l) ? (l === 'nb' ? 'no' : l) : 'en'; };

  // A short cache so Back, Reload and "More results" don't ask DuckDuckGo twice for the same thing.
  const cache = new Map();
  const TTL = 10 * 60 * 1000, CACHE_MAX = 60;
  const cached = (key) => { const c = cache.get(key); if (c && Date.now() - c.at < TTL) return c.value; cache.delete(key); return null; };
  const remember = (key, value) => { cache.set(key, { at: Date.now(), value }); if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value); return value; };

  /** The real address behind a DuckDuckGo result link (//duckduckgo.com/l/?uddg=https%3A%2F%2F…). */
  function realUrl(href) {
    let url = decode(href);
    const u = /[?&]uddg=([^&]+)/.exec(url); if (u) { try { url = decodeURIComponent(u[1]); } catch { return ''; } }
    if (url.startsWith('//')) url = 'https:' + url;
    if (!/^https?:\/\/[^\s"'<>]+$/i.test(url)) return '';
    try { const h = new URL(url).hostname; if (h === 'duckduckgo.com' || h.endsWith('.duckduckgo.com')) return ''; } catch { return ''; }   // DuckDuckGo's own pages are never results
    return url;
  }
  /** The web results in a DuckDuckGo HTML page: title, address, snippet. Ads (result--ad) are skipped. */
  function parseResults(html) {
    const out = [], seen = new Set();
    for (const block of html.split(/<div[^>]+class="result\s/).slice(1)) {
      if (/^[^"]*result--ad/.test(block)) continue;
      const a = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(block);
      if (!a) continue;
      const url = realUrl(a[1]); if (!url || seen.has(url)) continue;
      seen.add(url);
      const sn = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/.exec(block);
      out.push({ title: strip(a[2]).slice(0, 160) || url, url, snippet: strip(sn ? sn[1] : '').slice(0, 320) });
    }
    return out;
  }
  /** The "Next" form's hidden fields, passed back by the page to fetch the next results. */
  function parseNext(html) {
    const form = /<form[^>]+action="\/html\/"[^>]*>([\s\S]*?)<\/form>/g;
    let m;
    while ((m = form.exec(html))) {
      if (!/value="Next"/i.test(m[1])) continue;
      const fields = {};
      for (const inp of m[1].matchAll(/<input[^>]+>/g)) {
        const name = /name="([^"]+)"/.exec(inp[0]), value = /value="([^"]*)"/.exec(inp[0]);
        if (name && value && name[1] !== 'b') fields[name[1]] = decode(value[1]);
      }
      if (fields.s) return fields;
    }
    return null;
  }
  const cleanNext = (next) => {
    if (!next || typeof next !== 'object') return null;
    const out = {};
    for (const [k, v] of Object.entries(next)) if (/^[a-zA-Z_]{1,20}$/.test(k) && typeof v === 'string' && v.length <= 400) out[k] = v;
    return out.s ? out : null;
  };

  /** Web results. `next` is the token from the previous answer (for "More results"). */
  async function webSearch(q, next) {
    const kl = region();
    const key = JSON.stringify([q, kl, next]);
    const hit = cached(key); if (hit) return hit;
    let r;
    try {
      r = next
        ? await fetch('https://html.duckduckgo.com/html/', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/x-www-form-urlencoded' }, UA), body: new URLSearchParams(Object.assign({}, next, { q, kl })).toString(), signal: timed(10000) })
        : await fetch('https://html.duckduckgo.com/html/?' + new URLSearchParams({ q, kl }).toString(), { headers: UA, signal: timed(10000) });
    } catch (err) {
      return { error: /abort|timeout/i.test(String(err && err.name)) ? 'timeout' : 'offline' };
    }
    let html;
    try { html = await r.text(); } catch { return { error: 'offline' }; }
    // 202 (or a page without results that talks about a challenge) means DuckDuckGo wants a human to prove it.
    if (r.status === 202 || (!/result__a/.test(html) && /anomaly|challenge|bots|unusual traffic/i.test(html))) return { error: 'blocked' };
    if (!r.ok) return { error: 'http', status: r.status };
    const results = parseResults(html);
    if (!results.length) return remember(key, { results: [], next: null, region: kl });
    return remember(key, { results, next: parseNext(html), region: kl });
  }

  /** A short Wikipedia summary for the query, in the app's language (English when that Wikipedia has nothing). */
  async function wikipedia(q) {
    const langs = [...new Set([wikiLang(), 'en'])];
    for (const lang of langs) {
      const key = JSON.stringify(['wiki', lang, q]);
      const hit = cached(key); if (hit) { if (hit.title) return hit; continue; }
      try {
        const params = new URLSearchParams({ action: 'query', generator: 'search', gsrsearch: q, gsrlimit: '1', gsrnamespace: '0', prop: 'extracts|pageimages|info', exintro: '1', explaintext: '1', exsentences: '3', piprop: 'thumbnail', pithumbsize: '320', inprop: 'url', format: 'json', formatversion: '2' });
        const r = await fetch(`https://${lang}.wikipedia.org/w/api.php?${params}`, { headers: Object.assign({ 'Api-User-Agent': 'TheStupidBrowser/' + app.getVersion() + ' (https://github.com/lattewirell-creator/stupid-browser)' }, UA), signal: timed(6000) });
        if (!r.ok) { remember(key, {}); continue; }
        const j = await r.json();
        const page = j.query && j.query.pages && j.query.pages[0];
        if (!page || !page.extract || /may refer to:|kan syfta på|kan avse/i.test(page.extract)) { remember(key, {}); continue; }
        return remember(key, { title: page.title, extract: String(page.extract).replace(/\(\s*[;,]\s*/g, '(').replace(/\(\s*\)/g, '').replace(/\s+([.,;:)])/g, '$1').replace(/\s+/g, ' ').trim().slice(0, 600), url: page.fullurl || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`, thumbnail: page.thumbnail && /^https:\/\/upload\.wikimedia\.org\//.test(page.thumbnail.source) ? page.thumbnail.source : null, lang });
      } catch { /* no card, no fuss */ }
    }
    return null;
  }

  handle('search:web', ['internal'], (_e, q, next) => {
    q = String(q || '').replace(/\s+/g, ' ').trim().slice(0, MAX_Q);
    if (!q) return { error: 'empty' };
    return webSearch(q, cleanNext(next));
  });
  handle('search:wiki', ['internal'], (_e, q) => {
    q = String(q || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!q || q.split(' ').length > 6 || /[:"]|site:|\bhttps?:/i.test(q)) return null;
    return wikipedia(q);
  });

  return { parseResults, parseNext, realUrl, cleanNext, decode };   // for tests
};
