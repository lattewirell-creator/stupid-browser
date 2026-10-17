'use strict';
/* Look & feel options from Settings → Customize: interface font, density, corners, tab style,
   frame tint and which toolbar buttons show. Applied as classes / CSS variables on <body>. */
(() => {
  const FONTS = {
    inter: "'Inter', 'Segoe UI', system-ui, sans-serif",
    system: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    serif: "'Newsreader', Georgia, serif",
    rounded: "'Nunito', 'Inter', sans-serif",
    mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace"
  };
  const BUTTONS = { shield: 'adblockBtn', pip: 'pipBtn', ai: 'aiBtn', grid: 'gridBtn', profile: 'profileBtn', home: 'homeBtn', sidebarBtn: 'railBtn' };
  window.applyCustomize = () => {
    const s = settings || {}, b = document.body, root = document.documentElement.style;
    root.setProperty('--sans', FONTS[s.uiFont] || FONTS.inter);
    for (const k of ['compact', 'comfortable', 'spacious']) b.classList.toggle('density-' + k, (s.density || 'comfortable') === k);
    for (const k of ['sharp', 'rounded', 'round']) b.classList.toggle('corners-' + k, (s.corners || 'rounded') === k);
    for (const k of ['classic', 'pills', 'minimal']) b.classList.toggle('tabs-' + k, (s.tabStyle || 'classic') === k);
    for (const k of ['none', 'soft', 'strong']) b.classList.toggle('tint-' + k, (s.frameTint || 'soft') === k);
    const hide = new Set(s.hideButtons || []);
    for (const [k, id] of Object.entries(BUTTONS)) { const el = document.getElementById(id); if (el) el.classList.toggle('user-hidden', hide.has(k)); }
  };
  window.applyCustomize();
})();
