// Memory test (.github/workflows/memory.yml): the same five sites as the website's numbers; after 90 s, "Sleep other tabs".
(async () => {
  const urls = ['https://en.wikipedia.org/wiki/Main_Page', 'https://www.youtube.com/', 'https://www.reddit.com/', 'https://github.com/', 'https://www.theverge.com/'];
  for (const u of urls) { newTab(u); await new Promise((r) => setTimeout(r, 500)); }
  // Later: put every tab except the one you're looking at to sleep ("Sleep other tabs" in the tab menu).
  setTimeout(() => { tabs.forEach((t) => { if (t.id !== activeId) sleepTab(t, true); }); }, 90000);
})();
