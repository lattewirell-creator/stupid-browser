'use strict';
// node test/search-parse.js: the DuckDuckGo HTML parser and the instant answers, with no network.
const assert = require('assert');
const mod = require('../src/search-main.js')({ app: { getLocale: () => 'sv', getVersion: () => '0' }, handle: () => {} });
Object.defineProperty(globalThis, 'navigator', { value: { language: 'en-US' }, configurable: true });   // the decimal-comma rule looks at the browser language; pin it
const answers = require('../src/pages/search-answers.js');
const row = (href, title, snippet, ad) => `
<div class="result results_links results_links_deep ${ad ? 'result--ad ' : ''}web-result">
  <div class="links_main links_deep result__body">
    <h2 class="result__title"><a rel="nofollow" class="result__a" href="${href}">${title}</a></h2>
    <div class="result__extras"><div class="result__extras__url"><a class="result__url" href="${href}">example.com</a></div></div>
    <a class="result__snippet" href="${href}">${snippet}</a>
  </div>
</div>`;
const html = `<html><body><div id="links" class="results">
${row('//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa%3Fx%3D1%26y%3D2&amp;rut=abc', 'First &amp; <b>best</b>', 'A <b>snippet</b> with &quot;quotes&quot;')}
${row('https://duckduckgo.com/y.js?ad_domain=shop.com&amp;u3=x', 'Buy now', 'An ad', true)}
${row('//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa%3Fx%3D1%26y%3D2&amp;rut=dup', 'Same page again', 'dup')}
${row('//duckduckgo.com/l/?uddg=https%3A%2F%2Fsv.wikipedia.org%2Fwiki%2FStockholm&amp;rut=def', 'Stockholm – Wikipedia', 'Stockholm är Sveriges huvudstad')}
<div class="nav-link"><form action="/html/" method="post"><input type="hidden" name="q" value="stockholm"><input type="hidden" name="s" value="30"><input type="hidden" name="nextParams" value=""><input type="hidden" name="v" value="l"><input type="hidden" name="o" value="json"><input type="hidden" name="dc" value="31"><input type="hidden" name="api" value="d"><input type="hidden" name="vqd" value="4-123"><input type="hidden" name="kl" value="se-sv"><input type="submit" class="btn btn--alt" value="Next"></form></div>
</div></body></html>`;
const r = mod.parseResults(html);
assert.strictEqual(r.length, 2, 'ad and duplicate dropped');
assert.deepStrictEqual(r[0], { title: 'First & best', url: 'https://example.com/a?x=1&y=2', snippet: 'A snippet with "quotes"' });
assert.strictEqual(r[1].url, 'https://sv.wikipedia.org/wiki/Stockholm');
const next = mod.parseNext(html);
assert.deepStrictEqual(next, { q: 'stockholm', s: '30', nextParams: '', v: 'l', o: 'json', dc: '31', api: 'd', vqd: '4-123', kl: 'se-sv' });
assert.strictEqual(mod.parseNext('<form action="/html/"><input name="s" value="0"><input type="submit" value="Previous"></form>'), null, 'only the Next form');
assert.strictEqual(mod.realUrl('//duckduckgo.com/l/?uddg=javascript%3Aalert(1)'), '', 'no javascript: links');
assert.strictEqual(mod.realUrl('https://duckduckgo.com/y.js?u=1'), '', 'no DuckDuckGo-internal links');
assert.strictEqual(mod.realUrl('//duckduckgo.com/l/?uddg=https%3A%2F%2Fa.b%2Fc%20d'), '', 'no spaces in addresses');
const A = (q) => answers.answer(q);
assert.strictEqual(A('12*4+3').big, '51');
assert.strictEqual(A('20% of 150').big, '30');
assert.strictEqual(A('1,5+2').big, '3.5');
assert.strictEqual(A('2^10').big, '1 024');
assert.strictEqual(A('5 km in miles').big, '3.1069 miles');
assert.strictEqual(A('3 mil i km').big, '30 km');
assert.strictEqual(A('72 f to c').big, '22.2222 °C');
assert.strictEqual(A('hello world'), null);
assert.strictEqual(A('2024'), null);
assert.strictEqual(A('1/0'), null, 'infinity is not an answer');
assert.strictEqual(A('alert(1)'), null);
assert.strictEqual(A('5 km to kg'), null, 'different kinds');
console.log('[PASS] search parser and instant answers');
// not sums: times, ratios, dates, year ranges, phone numbers, English thousands
for (const q of ['10:30', '16:9', '2024-11-08', '2024-2025', '08-123 456']) assert.strictEqual(A(q), null, q + ' is not a sum');
assert.strictEqual(A('1,000 + 500').big, '1\u2009500', 'English thousands');
for (const [q, v] of [['12-5', '7'], ['100-7', '93'], ['1000-1', '999'], ['3 - 2 - 1', '0']]) assert.strictEqual(A(q).big, v, q + ' is a sum');
for (const q of ['070-123 45 67', '08-123 456', '2024-11-08', '2024-2025', '1 2 3']) assert.strictEqual(A(q), null, q + ' is not a sum');
assert.strictEqual(A('-2^2').big, '-4');
assert.strictEqual(A('100/3').big, '33.3333');
// next-token cleaning: only short string fields with plain names, and it must carry "s"
assert.deepStrictEqual(mod.cleanNext({ s: '30', 'bad key': 'x', n: 5, long: 'y'.repeat(401), vqd: 'ok' }), { s: '30', vqd: 'ok' });
assert.strictEqual(mod.cleanNext({ q: 'x' }), null); assert.strictEqual(mod.cleanNext('s=30'), null);
// entities: emoji and a literal &lt; in text
assert.strictEqual(mod.decode('&#128512; &amp;lt; &quot;x&quot;'), '😀 &lt; "x"');
assert.strictEqual(mod.realUrl('https://duckduckgo.com'), ''); assert.strictEqual(mod.realUrl('https://duckduckgo.com:443/x'), '');
assert.strictEqual(mod.parseResults('<div class="result x"><a class="result__a" href="https://a.com/caf%E9">T</a></div>').length, 1, 'odd escapes in addresses are kept for the page to handle');
console.log('[PASS] edge cases');
