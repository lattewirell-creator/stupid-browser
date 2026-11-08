(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ok = (c, n) => console.log(c ? '[PASS]' : '[FAIL]', n);
  const waitFor = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await sleep(250); } return false; };
  const inPage = (js) => activeTab().wv.executeJavaScript(js, false);
  // home
  navigate('stupid://search/');
  ok(await waitFor(() => activeTab().ready && activeTab().url.startsWith('stupid://search')), 'stupid://search/ loads');
  await sleep(800);
  ok(await inPage(`!document.getElementById('home').classList.contains('hidden')`), 'home shown without a query');
  console.log('SHOT:search-home'); await sleep(500);
  // instant answer + results page
  navigate('stupid://search/?q=2^10');
  await sleep(1500);
  ok(await inPage(`document.getElementById('answer').textContent.includes('1 024')`), 'instant answer 2^10 = 1 024');
  ok(await waitFor(() => inPage(`document.getElementById('status').classList.contains('hidden')`), 20000), 'web search finished');
  const state = await inPage(`JSON.stringify({ n: document.querySelectorAll('#list li').length, notice: document.getElementById('notice').textContent.slice(0, 60), title: document.title })`);
  console.log('[T] state', state);
  ok(JSON.parse(state).title === '2^10 · Stupid Search', 'tab title is the query');
  ok(JSON.parse(state).n > 0 || JSON.parse(state).notice.length > 0, 'results or a clear notice');
  console.log('SHOT:search-results'); await sleep(500);
  // address bar goes through Stupid Search once it's the engine
  await call('settings:set', { search: 'stupid' }); await sleep(300);
  navigate('5 km in miles'); await sleep(1500);
  ok(activeTab().url === 'stupid://search/?q=5%20km%20in%20miles', 'address bar search goes to stupid://search');
  ok(await inPage(`document.getElementById('answer').textContent.includes('3.1069 miles')`), 'conversion answer');
  ok($('address').placeholder === 'Search the web or type a URL', 'address placeholder');
  console.log('SHOT:search-convert'); await sleep(500);
  await call('settings:set', { search: 'duckduckgo' });
  console.log('QUIT');
})();
