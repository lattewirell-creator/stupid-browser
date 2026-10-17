'use strict';
/* Layout styles (Settings → Appearance), inspired by Arc and Zen:
   - Modern look: the page floats as a rounded card on a softly tinted frame
   - Vertical tabs: the tab strip becomes a sidebar list
   - Compact mode: toolbars hide and slide in when the pointer reaches the top edge (or the left edge for vertical tabs)
   Uses renderer.js globals (settings, call, $, el, renderAll, keyLabel). */
(() => {
  const body = document.body;
  // Wrap the top bars once so compact mode can slide them as one piece.
  const top = el('div'); top.id = 'topbars';
  $('titlebar').before(top); top.append($('titlebar'), $('toolbar'), $('bookmarksBar'));
  const vtabs = el('aside'); vtabs.id = 'vtabs';
  const vhead = el('div', 'vtabs-head');
  vtabs.appendChild(vhead);
  $('content').before(vtabs);
  const topZone = el('div', 'edge-zone top'), leftZone = el('div', 'edge-zone left');
  body.append(topZone, leftZone);

  const strip = [$('pinnedTabs'), $('tabs'), $('newTabBtn')];
  const anchor = document.querySelector('#titlebar .drag-fill');
  function placeStrip(vertical) {
    if (vertical) { if (strip[0].parentElement !== vtabs) vtabs.append(...strip); }
    else if (strip[0].parentElement !== $('titlebar')) strip.forEach((n) => anchor.before(n));
  }

  let revealT = 0;
  const lights = (on) => { if (window.stupid.platform === 'darwin') call('win:trafficLights', on).catch(() => {}); };
  function reveal(which) {
    clearTimeout(revealT);
    body.classList.add('reveal-' + which);
    if (which === 'top') lights(true);
  }
  function conceal(which, delay = 350) {
    clearTimeout(revealT);
    revealT = setTimeout(() => {
      const busy = document.activeElement === $('address') || !$('suggest').classList.contains('hidden') || !$('popover').classList.contains('hidden') || !$('menu').classList.contains('hidden');
      if (busy) return conceal(which, 600);
      body.classList.remove('reveal-' + which);
      if (which === 'top' && body.classList.contains('compact')) lights(false);
    }, delay);
  }
  topZone.addEventListener('mouseenter', () => reveal('top'));
  top.addEventListener('mouseenter', () => { if (body.classList.contains('compact')) reveal('top'); });
  top.addEventListener('mouseleave', () => { if (body.classList.contains('compact')) conceal('top'); });
  leftZone.addEventListener('mouseenter', () => reveal('left'));
  vtabs.addEventListener('mouseenter', () => { if (body.classList.contains('compact')) reveal('left'); });
  vtabs.addEventListener('mouseleave', () => { if (body.classList.contains('compact')) conceal('left'); });
  $('address').addEventListener('focus', () => { if (body.classList.contains('compact')) reveal('top'); });
  $('address').addEventListener('blur', () => { if (body.classList.contains('compact')) conceal('top', 500); });

  let applied = '';
  function applyLayout() {
    const modern = settings.modernLook !== false, vertical = !!settings.verticalTabs, compact = !!settings.compactMode;
    const key = [modern, vertical, compact].join();
    if (key === applied) return;
    applied = key;
    body.classList.toggle('look-modern', modern);
    body.classList.toggle('vtabs', vertical);
    body.classList.toggle('compact', compact);
    placeStrip(vertical);
    if (!compact) { body.classList.remove('reveal-top', 'reveal-left'); lights(true); } else lights(false);
    renderAll();
  }
  window.applyLayout = applyLayout;
  window.toggleLayout = (key) => call('settings:set', { [key]: !settings[key] });
  api.on('settings:changed', () => setTimeout(applyLayout, 0));
  call('settings:get').then((s) => { if (s) { settings = Object.assign({}, settings, s); applyLayout(); } }).catch(() => {});
})();
