(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ok = (c, n) => console.log(c ? '[PASS]' : '[FAIL]', n);
  const waitFor = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await sleep(250); } return false; };
  const inPage = (js) => activeTab().wv.executeJavaScript(js, false);
  const done = () => waitFor(() => inPage(`document.getElementById('status').classList.contains('hidden')`), 20000);
  const state = async () => JSON.parse(await inPage(`JSON.stringify({ n: document.querySelectorAll('#list li').length, notice: document.getElementById('notice').textContent, title: document.title, wiki: (document.querySelector('#wiki h2') || {}).textContent || '', wikiHidden: document.getElementById('wiki').classList.contains('hidden'), mine: document.getElementById('mine').textContent, more: !document.getElementById('moreWrap').classList.contains('hidden') })`));
  const netTrouble = (s) => /wants a human|reach the web|too long|hiccup/.test(s.notice);   // no network here: not the page's fault
  await call('bookmarks:set', [{ id: 'bt1', type: 'bookmark', title: 'Stockholm stad – officiell webbplats', url: 'https://start.stockholm/', parentId: null, ts: Date.now() }]);
  // home
  navigate('stupid://search/');
  ok(await waitFor(() => activeTab().ready && activeTab().url.startsWith('stupid://search')), 'stupid://search/ loads');
  await sleep(800);
  ok(await inPage(`!document.getElementById('home').classList.contains('hidden')`), 'home shown without a query');
  console.log('SHOT:search-home'); await sleep(500);
  // instant answer; no Wikipedia card for a sum
  navigate('stupid://search/?q=2^10'); await sleep(1500);
  ok(await inPage(`document.getElementById('answer').textContent.includes('1 024')`), 'instant answer 2^10 = 1 024');
  ok(await done(), 'web search finished');
  let s = await state(); console.log('[T] 2^10', JSON.stringify(s));
  ok(s.title === '2^10 · Stupid Search', 'tab title is the query');
  ok(s.n >= 5 || netTrouble(s), 'web results (or a network notice)');
  ok(s.wikiHidden, 'no Wikipedia card for a sum');
  console.log('SHOT:search-results'); await sleep(500);
  // a real topic: results, Wikipedia card, own bookmark, more results
  navigate('stupid://search/?q=stockholm'); await sleep(600);
  ok(await done(), 'second search finished'); await sleep(2500);
  s = await state(); console.log('[T] stockholm', JSON.stringify(s));
  ok(s.n >= 5 || netTrouble(s), 'results for stockholm');
  ok(s.wiki === 'Stockholm' || netTrouble(s), 'Wikipedia card is about Stockholm');
  ok(/From your bookmarks and history/.test(s.mine) && /start\.stockholm/.test(s.mine), 'own bookmark shown');
  if (s.more) { await inPage(`document.getElementById('more').click()`); ok(await waitFor(async () => (await state()).n > s.n, 12000), 'More results adds results'); }
  else ok(netTrouble(s), 'More results offered');
  // searches are remembered: Recent on the home page
  navigate('stupid://search/'); await sleep(1500);
  ok(await inPage(`[...document.querySelectorAll('#recentList a')].map((a) => a.textContent).join('|')`).then((t) => /stockholm/.test(t) && /2\^10/.test(t)), 'recent searches on the home page');
  // Stupid Search is the default engine, so the address bar lands on it
  ok((await call('settings:get')).search === 'stupid', 'Stupid Search is the default engine');
  navigate('5 km in miles'); await sleep(1500);
  ok(activeTab().url === 'stupid://search/?q=5%20km%20in%20miles', 'address bar search goes to stupid://search');
  ok(await inPage(`document.getElementById('answer').textContent.includes('3.1069 miles')`), 'conversion answer');
  ok($('address').placeholder === 'Search the web or type a URL', 'address placeholder');
  console.log('SHOT:search-convert'); await sleep(500);
  await call('bookmarks:set', []);
  console.log('QUIT');
})();
