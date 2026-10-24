// How quick does the browser feel on Windows? Run inside the window by the self-test (.github/workflows/perf.yml).
// Prints PERF: lines that main appends to STUPID_PERF_LOG: new-tab and tab-switch times (until the tab has really
// painted two frames) and how smoothly a long page scrolls (frame times inside the page).
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return Math.round(s[Math.floor(s.length / 2)]); };
  const out = (k, v) => console.log(`PERF:${k} ${v}`);
  await sleep(3000);
  // New tabs (the spare tab makes these instant when it works).
  const nt = [];
  for (let i = 0; i < 5; i++) { const t0 = performance.now(); const tab = newTab(); await painted(tab); nt.push(performance.now() - t0); await sleep(700); }
  out('newtab-ms', med(nt) + ' (all ' + nt.map(Math.round).join(',') + ')');
  // A real, long page.
  const page = newTab('https://en.wikipedia.org/wiki/Sweden');
  await new Promise((r) => { page.wv.addEventListener('did-stop-loading', r, { once: true }); setTimeout(r, 15000); });
  await sleep(1500);
  // Switching between the page and a new tab.
  const blank = tabs.find((t) => t !== page && isNewtab(t.url));
  const sw = [];
  for (let i = 0; i < 8; i++) { const to = i % 2 ? page : blank; const t0 = performance.now(); activate_(to.id); await painted(to); sw.push(performance.now() - t0); await sleep(400); }
  out('switch-ms', med(sw) + ' (all ' + sw.map(Math.round).join(',') + ')');
  // Scrolling: 150 frames of steady scrolling, timed inside the page.
  activate_(page.id); await painted(page); await sleep(600);
  const r = await page.wv.executeJavaScript(`new Promise((done) => {
    const gaps = []; let last = performance.now(), n = 0;
    const step = (t) => { gaps.push(t - last); last = t; scrollBy(0, 30); if (++n < 150) requestAnimationFrame(step); else done(gaps); };
    requestAnimationFrame((t) => { last = t; requestAnimationFrame(step); });
  })`);
  const s = [...r].sort((a, b) => a - b), p95 = s[Math.floor(s.length * 0.95)];
  out('scroll-fps', Math.round(1000 / (r.reduce((a, b) => a + b, 0) / r.length)));
  out('scroll-p95-ms', Math.round(p95));
  out('scroll-janky-frames', r.filter((g) => g > 25).length + '/' + r.length);
  console.log('QUIT');
})();
