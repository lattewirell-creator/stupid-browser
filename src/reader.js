'use strict';
/* Reader view: the article on the page, clean. A book button shows in the address bar on pages that look like an
 * article; one click lays the article (title, byline, text, pictures) over the page in the browser's own calm style,
 * with text size and light / sepia / dark. Esc or the button again goes back. Nothing is sent anywhere.
 * The page part finds the main text by scoring blocks with lots of running text and few links, skipping menus, ads,
 * comments and share buttons; the result is cleaned again here before it's shown. */
(() => {
  // Runs inside the page: is it an article, and what is it?
  const FIND = `(() => {
    const JUNK = /(comment|share|social|related|promo|advert|\\bads?\\b|sponsor|newsletter|subscribe|cookie|banner|nav|menu|footer|sidebar|breadcrumb|popup|modal|widget|recommend|outbrain|taboola)/i;
    const text = (e) => (e.innerText || '').trim();
    const paras = [...document.querySelectorAll('p')].filter((p) => text(p).length > 60);
    if (paras.length < 4) return { article: false };
    const scores = new Map();
    for (const p of paras) {
      const len = text(p).length;
      let node = p.parentElement, depth = 0;
      while (node && node !== document.body && depth < 4) {
        const cls = (node.className && node.className.baseVal == null ? node.className : '') + ' ' + node.id;
        if (!JUNK.test(cls)) scores.set(node, (scores.get(node) || 0) + len / (depth + 1));
        node = node.parentElement; depth++;
      }
    }
    let best = null, top = 0;
    for (const [node, s] of scores) {
      const links = [...node.querySelectorAll('a')].reduce((n, a) => n + text(a).length, 0);
      const all = text(node).length || 1;
      const score = s * (1 - Math.min(0.9, links / all)) * (/^(ARTICLE|MAIN)$/.test(node.tagName) || node.getAttribute('role') === 'main' ? 1.3 : 1);
      if (score > top) { top = score; best = node; }
    }
    if (!best || top < 1200) return { article: false };
    const KEEP = { P: 'p', H1: 'h2', H2: 'h2', H3: 'h3', H4: 'h4', H5: 'h4', UL: 'ul', OL: 'ol', LI: 'li', BLOCKQUOTE: 'blockquote', PRE: 'pre', CODE: 'code', EM: 'em', I: 'em', STRONG: 'strong', B: 'strong', A: 'a', BR: 'br', FIGURE: 'figure', FIGCAPTION: 'figcaption', IMG: 'img', TABLE: 'table', TR: 'tr', TD: 'td', TH: 'th', TBODY: 'tbody', THEAD: 'thead' };
    const walk = (node) => {
      if (node.nodeType === 3) return node.textContent.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
      if (node.nodeType !== 1) return '';
      const cls = (typeof node.className === 'string' ? node.className : '') + ' ' + node.id;
      if (/^(SCRIPT|STYLE|NOSCRIPT|IFRAME|FORM|BUTTON|NAV|ASIDE|FOOTER|SVG|INPUT|SELECT|TEXTAREA)$/.test(node.tagName) || (node !== best && JUNK.test(cls))) return '';
      const s = getComputedStyle(node); if (s.display === 'none' || s.visibility === 'hidden') return '';
      const inner = [...node.childNodes].map(walk).join('');
      const tag = KEEP[node.tagName];
      if (tag === 'img') { const src = node.currentSrc || node.src; return /^https?:/.test(src) && (node.naturalWidth || 200) >= 120 ? '<img src="' + src.replace(/"/g, '%22') + '">' : ''; }
      if (tag === 'a') { const h = node.href; return /^https?:/.test(h) ? '<a href="' + h.replace(/"/g, '%22') + '">' + inner + '</a>' : inner; }
      if (tag === 'br') return '<br>';
      if (!tag) return inner;
      return inner.trim() ? '<' + tag + '>' + inner + '</' + tag + '>' : '';
    };
    const meta = (n) => { const m = document.querySelector('meta[property="' + n + '"], meta[name="' + n + '"]'); return m ? m.content : ''; };
    const h1 = document.querySelector('h1');
    return { article: true, title: meta('og:title') || (h1 ? text(h1) : document.title), byline: meta('author') || meta('article:author') || '', site: meta('og:site_name') || location.hostname.replace(/^www\\./, ''), html: walk(best), words: text(best).split(/\\s+/).length };
  })()`;
  const tabFor = () => (typeof activeTab === 'function' ? activeTab() : null);
  /** Cleans the article again here: only plain tags, only web links and pictures. */
  function clean(html) {
    const doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
    const OK = new Set(['P', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE', 'EM', 'STRONG', 'A', 'BR', 'FIGURE', 'FIGCAPTION', 'IMG', 'TABLE', 'TR', 'TD', 'TH', 'TBODY', 'THEAD', 'DIV']);
    const walk = (n) => {
      // Bottom-up: a child is cleaned before it can be unwrapped, so nothing moves up uncleaned. The page itself
      // produced this HTML (and could have tampered with it), so it's treated as hostile.
      for (const c of [...n.children]) {
        walk(c);
        if (!OK.has(c.tagName)) { c.replaceWith(...(/^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT|TITLE|TEXTAREA|XMP|IFRAME|OBJECT|EMBED|SVG|MATH)$/i.test(c.tagName) ? [] : c.childNodes)); continue; }
        for (const a of [...c.attributes]) if (!((c.tagName === 'A' && a.name === 'href') || (c.tagName === 'IMG' && a.name === 'src'))) c.removeAttribute(a.name);
        if (c.tagName === 'A' && !/^https?:/.test(c.getAttribute('href') || '')) c.removeAttribute('href');
        if (c.tagName === 'A') { c.setAttribute('target', '_blank'); c.setAttribute('rel', 'noopener'); }
        if (c.tagName === 'IMG' && !/^https?:/.test(c.getAttribute('src') || '')) c.remove();
      }
    };
    walk(doc.body.firstChild);
    return doc.body.firstChild;
  }
  let view = null;
  const prefs = () => { try { return Object.assign({ size: 19, theme: 'auto' }, JSON.parse(localStorage.getItem('reader') || '{}')); } catch { return { size: 19, theme: 'auto' }; } };
  const savePrefs = (p) => { try { localStorage.setItem('reader', JSON.stringify(p)); } catch {} };
  function close() { if (!view) return; const v = view; view = null; v.classList.add('leaving'); setTimeout(() => v.remove(), 160); $('readerBtn').classList.remove('on'); }
  async function open() {
    const tab = tabFor(); if (!tab || !tab.wv || !tab.ready) return;
    let a; try { a = await tab.wv.executeJavaScript(FIND); } catch { a = null; }
    if (!a || !a.article) { toast('This page doesn’t look like an article'); return; }
    const p = prefs();
    view = el('div', 'reader-view');
    view.dataset.theme = p.theme; view.style.setProperty('--rsize', p.size + 'px');
    const bar = el('div', 'reader-bar');
    const btn = (label, title, fn) => { const b = el('button', 'pill small', label); b.title = title; b.addEventListener('click', fn); bar.appendChild(b); return b; };
    btn('A−', 'Smaller text', () => { p.size = Math.max(14, p.size - 1); view.style.setProperty('--rsize', p.size + 'px'); savePrefs(p); });
    btn('A+', 'Bigger text', () => { p.size = Math.min(28, p.size + 1); view.style.setProperty('--rsize', p.size + 'px'); savePrefs(p); });
    for (const [k, label] of [['auto', 'Auto'], ['light', 'Light'], ['sepia', 'Sepia'], ['dark', 'Dark']]) {
      const b = btn(label, label + ' theme', () => { p.theme = k; view.dataset.theme = k; savePrefs(p); bar.querySelectorAll('.theme-pick').forEach((x) => x.classList.toggle('solid', x === b)); });
      b.classList.add('theme-pick'); if (p.theme === k) b.classList.add('solid');
    }
    bar.appendChild(el('div', 'grow'));
    btn('Close', 'Back to the page (Esc)', close);
    const art = el('article', 'reader-article');
    art.appendChild(el('div', 'reader-site', a.site + (a.words ? ` · ${Math.max(1, Math.round(a.words / 230))} min read` : '')));
    art.appendChild(el('h1', 'reader-title', a.title));
    if (a.byline) art.appendChild(el('div', 'reader-byline', a.byline));
    const body = clean(a.html);
    // the article often repeats its own headline: show it once
    const norm = (x) => x.toLowerCase().replace(/\s+/g, ' ').trim();
    const dup = [...body.querySelectorAll('h1, h2')].slice(0, 2).find((h) => norm(h.textContent) === norm(a.title));
    if (dup) dup.remove();
    art.appendChild(body);
    const scroller = el('div', 'reader-scroll'); scroller.appendChild(art);
    view.append(bar, scroller);
    $('views').appendChild(view);
    $('readerBtn').classList.add('on');
    scroller.focus();
  }
  function toggle() { if (view) close(); else open(); }
  // The book button: shows on pages that look like an article (checked once the page has loaded).
  async function check(tab) {
    const b = $('readerBtn'); if (!b) return;
    if (!tab || tab !== tabFor() || !tab.wv || !tab.ready || /^stupid:/.test(tab.url)) { b.classList.add('hidden'); return; }
    let ok = false;
    try { ok = await tab.wv.executeJavaScript(`[...document.querySelectorAll('p')].filter((p) => (p.innerText || '').trim().length > 80).length >= 5`); } catch {}
    if (tab === tabFor()) b.classList.toggle('hidden', !ok);
  }
  $('readerBtn').addEventListener('click', toggle);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && view) { e.preventDefault(); close(); } });
  window.reader = { toggle, check, close, isOpen: () => !!view };
})();
