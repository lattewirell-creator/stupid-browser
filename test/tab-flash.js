// Opening and switching tabs must never flash black (Windows shows a tab's surface as black until it has painted).
// Main samples the window while each step happens (SAMPLE: in selfTest) and prints "[sample] <step> ... black=N".
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const step = async (label, fn, ms = 700) => { console.log(`SAMPLE:${ms}:${label}`); await sleep(20); fn(); await sleep(ms + 150); };
  await sleep(3000);
  await step('newtab-1', () => newTab());
  await step('newtab-2-quick', () => newTab(), 500);
  await step('newtab-3-quick', () => newTab(), 500);
  await sleep(1500);
  await step('newtab-4', () => newTab());
  const first = tabs[0].id, last = tabs[tabs.length - 1].id;
  for (let k = 0; k < 4; k++) await step('switch-' + k, () => activate_(k % 2 ? last : first), 400);
  console.log('[done] tab-flash');
})();
