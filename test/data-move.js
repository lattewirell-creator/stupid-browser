// CI (data-move-test.yml): asks Settings to move the data folder to D:\\, from the Settings page
// itself (the same call its "Move…" button makes). The browser then restarts twice by itself.
(async () => {
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  await w(4000);
  openInternal('settings'); await w(4000);
  const t = activeTab();
  const info = await t.wv.executeJavaScript("stupid.invoke('data:info')");
  console.log('MOVE-INFO ' + JSON.stringify({ dir: info.dir, atHome: info.atHome, drives: info.drives.map((d) => d.root) }));
  if (!info.atHome) { console.log('MOVE-ALREADY'); console.log('QUIT'); return; }
  const r = await t.wv.executeJavaScript("stupid.invoke('data:move', 'D:\\\\')");
  console.log('MOVE-RESULT ' + JSON.stringify(r));
})();
