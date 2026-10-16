(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => console.log('[T]', ...a);
  const ok = (cond, name) => console.log(cond ? '[PASS]' : '[FAIL]', name);
  const waitFor = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await sleep(250); } return false; };
  try {
    // --- tabs
    navigate('example.com');
    ok(await waitFor(() => activeTab().ready && /Example/.test(activeTab().title)), 'navigate via address bar');
    const t2 = newTab('https://www.wikipedia.org');
    const t3 = newTab('https://example.org');
    await waitFor(() => t3.ready);
    ok(tabs.length === 3, 'three tabs open');
    ok(document.querySelectorAll('.tab .close').length === 3, 'close X on every tab');
    // --- groups
    const gid = newGroup([t2, t3], 'School');
    hidePop();
    await sleep(300);
    ok(groups.size === 1 && document.querySelector('.group-chip') && document.querySelector('.group-chip').textContent.includes('School'), 'tab group chip shown');
    console.log('SHOT:groups'); await sleep(600);
    toggleCollapse(gid); await sleep(300);
    ok(t2.el.classList.contains('collapsed-hide') && t3.el.classList.contains('collapsed-hide'), 'group collapses');
    console.log('SHOT:collapsed'); await sleep(500);
    toggleCollapse(gid); await sleep(200);
    ok(!t2.el.classList.contains('collapsed-hide'), 'group expands');
    // --- move tab (drag logic)
    moveTab(tabs[0], tabs[2], true);
    ok(tabs[2].url.includes('example.com') && !tabs[2].groupId, 'drag-reorder to end leaves group');
    // --- close + reopen
    closeTab(t3.id);
    ok(tabs.length === 2, 'close tab');
    reopenClosed(); await sleep(300);
    ok(tabs.length === 3 && tabs.some((t) => t.url.includes('example.org') && t.groupId === gid), 'reopen closed tab back into its group');
    // --- close others / right
    const before = tabs.length;
    const extra = newTab('https://example.net', { activate: true });
    closeRight(tabs[0]); await sleep(200);
    ok(tabs.length === 1, 'close tabs to the right');
    newTab('https://www.wikipedia.org'); newTab('https://example.com');
    await waitFor(() => activeTab().ready);
    // --- zoom
    zoom(1); zoom(1); await sleep(300);
    ok(Math.abs(activeTab().zoom - 1.25) < 0.01 && !$('zoomBtn').classList.contains('hidden'), 'zoom in shows indicator');
    zoom(0); await sleep(200);
    ok($('zoomBtn').classList.contains('hidden'), 'zoom reset');
    // --- find
    openFind(); $('findInput').value = 'domain'; find(true); await sleep(800);
    ok(/[1-9]\/[1-9]/.test($('findCount').textContent), 'find in page counts matches: ' + $('findCount').textContent);
    console.log('SHOT:find'); await sleep(500);
    closeFind();
    // --- mute
    toggleMute(activeTab()); await sleep(200);
    ok(activeTab().wv.isAudioMuted() && !activeTab().el.querySelector('.audio').classList.contains('hidden'), 'mute tab shows indicator');
    toggleMute(activeTab());
    // --- bookmark
    toggleBookmark(); await sleep(300);
    ok(bookmarks.some((b) => b.url.includes('example.com')), 'bookmark added');
    console.log('SHOT:bookmark'); await sleep(500);
    hidePop();
    // --- autocomplete
    $('address').focus(); $('address').value = 'exam'; await updateSuggest(true); await sleep(200);
    ok(sugItems.length > 1 && !$('suggest').classList.contains('hidden'), 'address bar suggestions: ' + sugItems.map((s) => s.kind).join(','));
    console.log('SHOT:suggest'); await sleep(500);
    closeSuggest(); $('address').blur();
    // --- site info
    await siteInfo(); await sleep(400);
    ok(!$('popover').classList.contains('hidden') && $('popover').textContent.includes('Camera'), 'site info popover with permissions');
    console.log('SHOT:siteinfo'); await sleep(500);
    hidePop();
    // --- permission prompt
    activeTab().wv.executeJavaScript('navigator.geolocation.getCurrentPosition(()=>{},()=>{}); 1');
    ok(await waitFor(() => $('popover').classList.contains('perm-pop')), 'permission prompt appears');
    console.log('SHOT:perm'); await sleep(500);
    document.querySelector('.perm-pop .pill').click(); await sleep(300);
    const perms = await call('perms:get');
    ok(perms['https://example.com'] && perms['https://example.com'].location === 'block', 'permission decision saved');
    // --- password offer
    await activeTab().wv.executeJavaScript(`document.body.innerHTML += '<form id=f onsubmit="return false"><input name=u id=u><input type=password id=p></form>'; document.getElementById('u').value='testuser'; document.getElementById('p').value='hunter22'; document.getElementById('f').requestSubmit(); 1`);
    ok(await waitFor(() => $('popover').classList.contains('pw-pop'), 6000), 'offer to save password');
    console.log('SHOT:password'); await sleep(500);
    [...document.querySelectorAll('.pw-pop .pill')].find((b) => b.textContent === 'Save').click(); await sleep(600);
    activeTab().wv.reload(); await waitFor(() => activeTab().ready && !activeTab().loading);
    await sleep(800);
    await activeTab().wv.executeJavaScript(`document.body.innerHTML += '<form><input name=u id=u2><input type=password id=p2></form>'; 1`);
    await sleep(1500);
    const filled = await activeTab().wv.executeJavaScript(`document.getElementById('p2').value`);
    ok(filled === 'hunter22', 'password autofill on login form');
    // --- download
    activeTab().wv.downloadURL('https://raw.githubusercontent.com/github/gitignore/main/Node.gitignore');
    ok(await waitFor(() => [...dls.values()].some((d) => d.state === 'completed'), 20000), 'download completes');
    console.log('SHOT:download'); await sleep(500);
    hidePop();
    // --- internal pages
    for (const p of ['settings', 'history', 'downloads', 'bookmarks']) {
      openInternal(p);
      await waitFor(() => activeTab().ready && !activeTab().loading);
      await sleep(900);
      const r = await activeTab().wv.executeJavaScript('typeof window.stupid + ":" + document.body.innerText.length');
      ok(r.startsWith('object') && +r.split(':')[1] > 50, `internal page ${p} (${r})`);
      console.log('SHOT:page-' + p); await sleep(600);
    }
    const hist = await activeTab().wv.executeJavaScript('1');
    // settings change propagates
    await call('settings:set', { search: 'duckduckgo' }); await sleep(300);
    ok(toUrl('cats').startsWith('https://duckduckgo.com/?q=cats'), 'search engine switch');
    await call('settings:set', { search: 'google' });
    // --- view source
    activate_(tabs.find((t) => t.url.includes('example.com')).id); await sleep(300);
    runCmd('view-source'); await sleep(2500);
    ok(activeTab().url.startsWith('stupid://source') && (await activeTab().wv.executeJavaScript('document.querySelectorAll(".ln").length')) >= 2, 'view source');
    console.log('SHOT:source'); await sleep(500);
    // --- sidebar app + AI
    openApp('discord'); await sleep(2500);
    ok(!$('appPanel').classList.contains('hidden'), 'sidebar app panel opens');
    openAI(); await sleep(2500);
    ok(aiBot === 'https://claude.ai', 'AI sidebar defaults to Claude');
    console.log('SHOT:panels'); await sleep(600);
    closeApp(); closeAI();
    // --- command bar
    openCmd(); $('cmdInput').value = 'wiki'; renderCmd(); await sleep(200);
    ok(cmdItems.some((i) => i.kind === 'tab'), 'command bar finds open tab');
    closeCmd();
    // --- split view
    toggleSplit(); await sleep(400);
    ok(split && document.querySelectorAll('#views webview.visible').length === 2, 'split view');
    console.log('SHOT:split'); await sleep(500);
    toggleSplit();
    // --- context menu on tab
    tabMenu(activeTab(), 300, 60); await sleep(200);
    ok($('ctxMenu').textContent.includes('Close tabs to the right') && $('ctxMenu').textContent.includes('Add tab to new group'), 'tab context menu');
    console.log('SHOT:tabmenu'); await sleep(400);
    hideMenus();
    mainMenu(); await sleep(200); console.log('SHOT:menu'); await sleep(400); hideMenus();
    // history recorded
    const sug = await call('history:suggest', 'wikipedia');
    ok(sug.length > 0, 'history recorded');
    log('tabs at end', tabs.length, 'groups', groups.size);
    scheduleSave(); await sleep(1500);
    console.log('DONE');
    console.log('QUIT');
  } catch (e) { console.log('[FAIL] exception', e && e.stack); console.log('QUIT'); }
})();
