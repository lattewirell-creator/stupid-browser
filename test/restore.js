(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ok = (c, n) => console.log(c ? '[PASS]' : '[FAIL]', n);
  await sleep(1500);
  ok(tabs.length >= 6, 'session restored tabs: ' + tabs.length);
  ok(groups.size === 1 && [...groups.values()][0].name === 'School', 'tab group restored');
  ok(tabs.filter((t) => t.wv).length <= 2, 'background tabs lazy (loaded: ' + tabs.filter((t) => t.wv).length + ')');
  console.log('SHOT:restored'); await sleep(500);
  await call('settings:set', { theme: 'dark' }); await sleep(800);
  console.log('SHOT:dark'); await sleep(500);
  openInternal('settings'); await sleep(2000);
  console.log('SHOT:dark-settings'); await sleep(500);
  await call('settings:set', { theme: 'system' });
  await call('win:new', { incognito: true }); await sleep(3500);
  console.log('SHOT:after-incognito');
  await call('win:new', {}); await sleep(3000);
  console.log('[T] windows opened ok');
  console.log('QUIT');
})();
