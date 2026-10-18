// Build mac/adblock/rules.json: a WebKit content-blocker rule list (the JSON that
// WKContentRuleListStore.compileContentRuleList accepts) from EasyList + EasyPrivacy.
// Only a safe subset is converted; anything that cannot be expressed exactly is skipped.
// Usage: node scripts/build-mac-blocklist.js [--lists-dir DIR]   (DIR holds easylist.txt/easyprivacy.txt offline)
const fs = require('fs');
const path = require('path');

const LISTS = ['https://ublockorigin.github.io/uAssets/thirdparties/easylist.txt', 'https://ublockorigin.github.io/uAssets/thirdparties/easyprivacy.txt'];
const OUT = path.join(__dirname, '..', 'mac', 'adblock', 'rules.json');
const MAX_RULES = 140000; // WebKit refuses lists over 150k rules
const CHUNK = 500; // selectors per generic css-display-none rule

// The biggest ad/tracking networks (same set as build-android-blocklist.js).
const BIG = ['doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'adservice.google.com', 'pagead2.googlesyndication.com',
  'amazon-adsystem.com', 'adnxs.com', 'criteo.com', 'criteo.net', 'taboola.com', 'outbrain.com', 'scorecardresearch.com', 'moatads.com',
  'rubiconproject.com', 'pubmatic.com', 'openx.net', 'casalemedia.com', 'adsrvr.org', 'quantserve.com', 'hotjar.com', 'google-analytics.com',
  'googletagmanager.com', 'googletagservices.com', 'ads-twitter.com', 'ads.linkedin.com', 'connect.facebook.net', 'analytics.tiktok.com', 'adform.net', 'smartadserver.com'];

const HOST_PREFIX = '^[^:]+://+([^:/]+\\.)?'; // what "||" means: any scheme, optional subdomains
const SEP = '[/:?&=]'; // what "^" means (WebKit has no alternation, so end-of-URL is not matched; URLs always have a path)
const TYPES = { script: 'script', image: 'image', stylesheet: 'style-sheet', font: 'font', media: 'media', xmlhttprequest: 'fetch', ping: 'ping', websocket: 'websocket' };
const ALL_TYPES = Object.values(TYPES);
const IGNORED_TYPES = new Set(['object', 'other', 'object-subrequest', 'webrtc']); // no WebKit equivalent: dropped from type lists
const SKIP_OPTS = /^(popup|popunder|csp|redirect|redirect-rule|removeparam|queryprune|rewrite|empty|mp4|header|permissions|to|denyallow|method|genericblock|replace|urltransform|uritransform|urlskip|cname|inline-script|inline-font|strict1p|strict3p|ipaddress|from|reason)$/;
// uBO / ABP extended (procedural) CSS that WebKit cannot parse.
const EXTENDED_CSS = /:(has-text|-abp-|xpath|style\(|matches-css|upward|remove|min-text-length|watch-attr|matches-path|matches-attr|matches-prop|matches-media|others|if\(|if-not|nth-ancestor|contains|properties|spath|shadow)|\{|\}|^\^|\[-ext-|:-ext-/;

// WebKit rejects :has() nested inside :has(); one bad selector would void a whole joined selector list.
function nestedHas(sel) {
  const stack = [];
  for (let i = 0; i < sel.length; i++) {
    if (sel.startsWith(':has(', i)) { if (stack.includes(true)) return true; stack.push(true); i += 4; }
    else if (sel[i] === '(') stack.push(false);
    else if (sel[i] === ')') stack.pop();
  }
  return false;
}
const isAscii = (s) => /^[\x20-\x7e]+$/.test(s);
const validDomain = (d) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z0-9-]{2,}$/.test(d);

// ABP pattern body (after "||", without options) -> WebKit url-filter, or null if unsupported/too generic.
function patternToFilter(body) {
  if (!isAscii(body) || /\s/.test(body)) return null;
  let end = '';
  if (body.endsWith('|')) { body = body.slice(0, -1); end = '$'; }
  body = body.replace(/\*+$/, '').replace(/\^\|$/, '^');
  // The host part must be a concrete, real-looking domain.
  const m = /^([a-z0-9.-]+)(.*)$/i.exec(body);
  if (!m) return null;
  const host = m[1].toLowerCase();
  const rest = m[2];
  // "example.com" or a 2+ label prefix such as "ads.example." -- never a bare label like "||ads." (too generic).
  if (!validDomain(host) && !/^[a-z0-9-]+(\.[a-z0-9-]+)+\.$/.test(host)) return null;
  if (host.replace(/\./g, '').length < 4) return null;
  if (rest !== '' && !/^[\^/:*?]/.test(rest)) return null;
  let out = HOST_PREFIX + host.replace(/\./g, '\\.');
  for (const ch of rest) {
    if (ch === '*') out += '.*';
    else if (ch === '^') out += SEP;
    else if ('.+?()[]{}\\$|'.includes(ch)) out += '\\' + ch;
    else out += ch;
  }
  out = out.replace(/(\.\*)+/g, '.*');
  return out + end;
}

// Parse "$a,b,c" options. Returns { ok, rule-trigger extras, flags } or { ok:false }.
function parseOptions(optStr) {
  const r = { ok: true, trigger: {}, important: false, badfilter: false, document: false, elemhide: false, generichide: false, matchCase: false };
  if (!optStr) return r;
  const pos = []; const neg = [];
  let subdoc = false;
  for (const raw of optStr.split(',')) {
    const opt = raw.trim();
    if (!opt) return { ok: false };
    let o = opt.replace(/^_+$/, '');
    if (o === '') continue;
    const not = o.startsWith('~');
    const name = (not ? o.slice(1) : o).toLowerCase();
    if (name === 'third-party' || name === '3p') r.trigger['load-type'] = [not ? 'first-party' : 'third-party'];
    else if (name === 'first-party' || name === '1p') r.trigger['load-type'] = [not ? 'third-party' : 'first-party'];
    else if (name === 'match-case') r.matchCase = true;
    else if (name === 'important') r.important = true;
    else if (name === 'badfilter') r.badfilter = true;
    else if (name === 'all') { /* every type: no resource-type restriction */ }
    else if (name === 'document' || name === 'doc') { if (not) return { ok: false }; r.document = true; }
    else if (name === 'elemhide' || name === 'ehide') r.elemhide = true;
    else if (name === 'generichide' || name === 'ghide') r.generichide = true;
    else if (name === 'subdocument' || name === 'frame') { if (not) return { ok: false }; subdoc = true; }
    else if (name === 'stylesheet' || name === 'css') (not ? neg : pos).push('style-sheet');
    else if (name === 'xhr') (not ? neg : pos).push('fetch');
    else if (TYPES[name]) (not ? neg : pos).push(TYPES[name]);
    else if (IGNORED_TYPES.has(name)) { if (!not) pos.push(null); }
    else if (name.startsWith('domain=') && !not) {
      const doms = opt.slice(7).toLowerCase().split('|');
      const inc = []; const exc = [];
      for (const d of doms) {
        const n = d.startsWith('~'); const dd = n ? d.slice(1) : d;
        if (!validDomain(dd)) return { ok: false }; // entities like google.* or regex domains
        (n ? exc : inc).push('*' + dd);
      }
      if (inc.length && exc.length) return { ok: false }; // WebKit cannot mix if- and unless-domain
      if (inc.length) r.trigger['if-domain'] = inc; else r.trigger['unless-domain'] = exc;
    } else return { ok: false }; // popup, csp, redirect, removeparam, ... or unknown
    if (SKIP_OPTS.test(name)) return { ok: false };
  }
  if (subdoc) {
    // WebKit's "document" type covers frames; only safe for third-party frames (never the top page itself).
    if (r.trigger['load-type']?.[0] !== 'third-party') return { ok: false };
    pos.push('document');
  }
  let types = null;
  if (pos.length) {
    types = pos.filter(Boolean);
    if (!types.length) return { ok: false }; // only unsupported types (e.g. $object)
  } else if (neg.length) types = ALL_TYPES.filter((t) => !neg.includes(t));
  if (types) r.trigger['resource-type'] = [...new Set(types)];
  return r;
}

async function loadLists() {
  const dirArg = process.argv.indexOf('--lists-dir');
  const texts = [];
  for (const url of LISTS) {
    if (dirArg > 0) texts.push(fs.readFileSync(path.join(process.argv[dirArg + 1], path.basename(url)), 'utf8'));
    else {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
      texts.push(await res.text());
    }
  }
  return texts.join('\n').split(/\r?\n/);
}

(async () => {
  const lines = await loadLists();
  const blocks = []; const importantBlocks = []; const exceptions = [];
  const docExceptions = []; const elemhideExceptions = []; const generichideExceptions = [];
  const genericSel = new Set(); const genericHideExc = new Set(); const domainHideExc = new Map(); // selector -> Set(domain)
  const domainSel = new Map(); // key (if-domain/unless-domain JSON) -> { trigger, selectors:Set }
  const badfilters = new Set();
  const skipped = { network: 0, cosmetic: 0 };
  const seen = new Set();
  const key = (r) => JSON.stringify(r);

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('!') || line.startsWith('[')) continue;

    // ---- cosmetic ----
    const cm = /^([^#$]*?)(##|#@#|#\?#|#\$#|#@\?#|#@\$#|#%#|#@%#)(.+)$/.exec(line);
    if (cm && !line.startsWith('||') && !line.startsWith('@@') && !line.startsWith('/') && !line.startsWith('|')) {
      const [, doms, sep, sel] = cm;
      if ((sep !== '##' && sep !== '#@#') || EXTENDED_CSS.test(sel) || nestedHas(sel) || !isAscii(sel) || sel.startsWith('+js(')) { skipped.cosmetic++; continue; }
      const domains = doms ? doms.toLowerCase().split(',').map((d) => d.trim()) : [];
      if (domains.some((d) => !validDomain(d.replace(/^~/, '')))) { skipped.cosmetic++; continue; }
      if (sep === '#@#') {
        if (!domains.length) genericHideExc.add(sel);
        else if (domains.every((d) => !d.startsWith('~'))) {
          if (!domainHideExc.has(sel)) domainHideExc.set(sel, new Set());
          domains.forEach((d) => domainHideExc.get(sel).add(d));
        } else skipped.cosmetic++;
        continue;
      }
      if (!domains.length) { genericSel.add(sel); continue; }
      const inc = domains.filter((d) => !d.startsWith('~')); const exc = domains.filter((d) => d.startsWith('~')).map((d) => d.slice(1));
      if (inc.length && exc.length) { skipped.cosmetic++; continue; }
      const trigger = { 'url-filter': '.*' };
      if (inc.length) trigger['if-domain'] = [...new Set(inc)].sort().map((d) => '*' + d);
      else trigger['unless-domain'] = [...new Set(exc)].sort().map((d) => '*' + d);
      const k = key(trigger);
      if (!domainSel.has(k)) domainSel.set(k, { trigger, selectors: new Set() });
      domainSel.get(k).selectors.add(sel);
      continue;
    }

    // ---- network ----
    let exception = false; let s = line;
    if (s.startsWith('@@')) { exception = true; s = s.slice(2); }
    if (!s.startsWith('||')) { skipped.network++; continue; } // regex, plain-substring and |http rules are not converted
    const di = s.lastIndexOf('$');
    let body = s.slice(2); let opts = '';
    if (di > 1) { body = s.slice(2, di); opts = s.slice(di + 1); }
    const o = parseOptions(opts);
    if (!o.ok) { skipped.network++; continue; }
    if (o.badfilter) { badfilters.add((exception ? '@@' : '') + s.replace(/[$,]badfilter/, '')); continue; }

    if (exception && (o.document || o.elemhide || o.generichide)) {
      // Page-level exceptions: only for plain "||domain^" so they map onto the page's domain.
      const dm = /^([a-z0-9.-]+)\^?$/.exec(body.toLowerCase());
      if (!dm || !validDomain(dm[1]) || o.trigger['if-domain'] || o.trigger['unless-domain']) { skipped.network++; continue; }
      const rule = { trigger: { 'url-filter': '.*', 'if-domain': ['*' + dm[1]] }, action: { type: 'ignore-previous-rules' } };
      if (o.document) docExceptions.push({ src: '@@' + s, rule });
      else {
        rule.trigger['resource-type'] = ['document']; // CSS rules hang off the page load; leave subresource blocking alone
        (o.elemhide ? elemhideExceptions : generichideExceptions).push({ src: '@@' + s, rule });
      }
      continue;
    }
    if (o.document) { skipped.network++; continue; } // blocking whole pages is out of scope
    const filter = patternToFilter(body);
    if (!filter) { skipped.network++; continue; }
    const trigger = { 'url-filter': filter, ...o.trigger };
    if (o.matchCase) trigger['url-filter-is-case-sensitive'] = true;
    const rule = { trigger, action: { type: exception ? 'ignore-previous-rules' : 'block' } };
    const k = key(rule);
    if (seen.has(k)) continue;
    seen.add(k);
    (exception ? exceptions : o.important ? importantBlocks : blocks).push({ src: (exception ? '@@' : '') + s, rule });
  }

  const notBad = (x) => !badfilters.has(x.src);
  const big = BIG.map((d) => ({ src: `||${d}^`, rule: { trigger: { 'url-filter': HOST_PREFIX + d.replace(/\./g, '\\.') + SEP }, action: { type: 'block' } } }))
    .filter((x) => !seen.has(key(x.rule)));

  // Generic hiding: drop #@# selectors, and move selectors excepted on some domains into their own unless-domain rules.
  for (const sel of genericHideExc) genericSel.delete(sel);
  const genericExcepted = new Map();
  for (const [sel, doms] of domainHideExc) {
    if (!genericSel.has(sel)) continue;
    genericSel.delete(sel);
    const trigger = { 'url-filter': '.*', 'unless-domain': [...doms].sort().map((d) => '*' + d) };
    const k = key(trigger);
    if (!genericExcepted.has(k)) genericExcepted.set(k, { trigger, selectors: [] });
    genericExcepted.get(k).selectors.push(sel);
  }
  const generic = [...genericSel].sort();
  const genericRules = [];
  for (let i = 0; i < generic.length; i += CHUNK) genericRules.push({ trigger: { 'url-filter': '.*' }, action: { type: 'css-display-none', selector: generic.slice(i, i + CHUNK).join(', ') } });
  for (const { trigger, selectors } of genericExcepted.values()) genericRules.push({ trigger, action: { type: 'css-display-none', selector: selectors.join(', ') } });
  const domainRules = [...domainSel.values()].map(({ trigger, selectors }) => ({ trigger, action: { type: 'css-display-none', selector: [...selectors].join(', ') } }));

  // Priority for the rule cap: network blocks, exceptions, domain cosmetics, generic cosmetics.
  const cats = {
    block: [...big, ...blocks.filter(notBad)].map((x) => x.rule),
    important: importantBlocks.filter(notBad).map((x) => x.rule),
    exception: exceptions.filter(notBad).map((x) => x.rule),
    docException: docExceptions.filter(notBad).map((x) => x.rule),
    generichideException: generichideExceptions.filter(notBad).map((x) => x.rule),
    elemhideException: elemhideExceptions.filter(notBad).map((x) => x.rule),
    domainCosmetic: domainRules,
    genericCosmetic: genericRules,
  };
  let budget = MAX_RULES;
  const take = (name) => { const kept = cats[name].slice(0, Math.max(0, budget)); budget -= kept.length; if (kept.length < cats[name].length) console.warn(`cap: dropped ${cats[name].length - kept.length} ${name} rules`); cats[name] = kept; };
  ['block', 'important', 'exception', 'docException', 'elemhideException', 'generichideException', 'domainCosmetic', 'genericCosmetic'].forEach(take);

  // Order matters: ignore-previous-rules only cancels rules that come before it.
  const rules = [
    ...cats.block,
    ...cats.exception,
    ...cats.important, // $important blocks survive ordinary @@ exceptions
    ...cats.genericCosmetic,
    ...cats.generichideException, // cancels generic hiding (and the block of the page itself) on those sites
    ...cats.domainCosmetic,
    ...cats.elemhideException,
    ...cats.docException, // @@||site^$document: everything off on that site
  ];
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(rules));
  for (const [name, list] of Object.entries(cats)) console.log(`${name.padEnd(22)} ${list.length}`);
  console.log(`${'generic selectors'.padEnd(22)} ${generic.length + [...genericExcepted.values()].reduce((n, g) => n + g.selectors.length, 0)}`);
  console.log(`${'skipped network'.padEnd(22)} ${skipped.network}`);
  console.log(`${'skipped cosmetic'.padEnd(22)} ${skipped.cosmetic}`);
  console.log(`${'badfilter'.padEnd(22)} ${badfilters.size}`);
  console.log(`wrote ${rules.length} rules (${(fs.statSync(OUT).size / 1048576).toFixed(1)} MB) to ${OUT}`);
})().catch((e) => { console.error(e); process.exit(1); });
