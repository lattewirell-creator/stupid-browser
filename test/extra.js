(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ok = (c, n) => console.log(c ? '[PASS]' : '[FAIL]', n);
  navigate('example.com'); await sleep(3000);
  runCmd('devtools'); await sleep(2500);
  ok(activeTab().wv.isDevToolsOpened(), 'F12 dev tools open');
  runCmd('devtools'); await sleep(800);
  ok(!activeTab().wv.isDevToolsOpened(), 'F12 dev tools close');
  await call('win:fullscreen'); await sleep(1500);
  ok(document.body.classList.contains('fullscreen'), 'F11 full screen');
  console.log('SHOT:fullscreen'); await sleep(500);
  await call('win:fullscreen'); await sleep(1200);
  ok(!document.body.classList.contains('fullscreen'), 'leave full screen');
  console.log('QUIT');
})();
