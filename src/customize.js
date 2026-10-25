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
  const BUTTONS = { shield: 'adblockBtn', pip: 'pipBtn', ai: 'aiBtn', grid: 'gridBtn', profile: 'profileBtn', home: 'homeBtn', sidebarBtn: 'railBtn', dl: 'dlBtn', sound: 'soundBtn' };
  // The buttons right of the address bar, in their standard order: you can move them, hide them and add your own.
  const MOVABLE = ['dl', 'shield', 'sound', 'pip', 'ai', 'grid', 'profile'];
  const NAMES = { dl: 'Downloads', shield: 'Shield', sound: 'Sound & EQ', pip: 'Picture-in-picture', ai: 'AI buddy', grid: 'Apps', profile: 'Profile', home: 'Home', sidebarBtn: 'Sidebar' };
  window.applyCustomize = () => {
    const s = settings || {}, b = document.body, root = document.documentElement.style;
    root.setProperty('--sans', FONTS[s.uiFont] || FONTS.inter);
    for (const k of ['compact', 'comfortable', 'spacious']) b.classList.toggle('density-' + k, (s.density || 'comfortable') === k);
    for (const k of ['sharp', 'rounded', 'round']) b.classList.toggle('corners-' + k, (s.corners || 'rounded') === k);
    for (const k of ['classic', 'pills', 'minimal']) b.classList.toggle('tabs-' + k, (s.tabStyle || 'classic') === k);
    for (const k of ['none', 'soft', 'strong']) b.classList.toggle('tint-' + k, (s.frameTint || 'soft') === k);
    const hide = new Set(s.hideButtons || []);
    for (const [k, id] of Object.entries(BUTTONS)) { const el = document.getElementById(id); if (el) el.classList.toggle('user-hidden', hide.has(k)); }
    layoutToolbar(s, hide);
  };

  /* ---------------- the toolbar: order, your own buttons, and editing it ---------------- */
  const tb = () => document.getElementById('toolbar');
  const keyOf = (b) => b.dataset.tb;
  function layoutToolbar(s, hide) {
    const custom = (s.toolbar && s.toolbar.custom) || [];
    // Your own buttons: a link with a name and an emoji (or its first letter).
    for (const b of [...tb().querySelectorAll('.custom-btn')]) if (!custom.some((c) => 'c-' + c.id === b.id)) b.remove();
    const mine = {};
    for (const c of custom) {
      let b = document.getElementById('c-' + c.id);
      if (!b) {
        b = document.createElement('button'); b.id = 'c-' + c.id; b.className = 'icon-btn custom-btn';
        b.addEventListener('click', () => { if (!document.body.classList.contains('tb-edit')) newTab(b.dataset.url); });
      }
      b.dataset.url = c.url; b.title = c.name + ' · ' + c.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
      b.replaceChildren(Object.assign(document.createElement('span'), { className: 'custom-icon', textContent: c.icon || c.name.slice(0, 1).toUpperCase() }));
      b.classList.toggle('user-hidden', hide.has(c.id));
      mine[c.id] = b;   // not in the toolbar yet if it's new: placed below
    }
    // Order: the saved order first, then anything new in its standard place. The menu button stays last.
    const all = [...MOVABLE, ...custom.map((c) => c.id)];
    const order = [...((s.toolbar && s.toolbar.order) || []).filter((k) => all.includes(k)), ...all.filter((k) => !((s.toolbar && s.toolbar.order) || []).includes(k))];
    const menu = document.getElementById('menuBtn');
    for (const k of order) {
      const b = BUTTONS[k] ? document.getElementById(BUTTONS[k]) : mine[k];
      if (b) { b.dataset.tb = k; tb().insertBefore(b, menu); }
    }
    if (document.body.classList.contains('tb-edit')) renderSheet();
  }
  const current = () => {
    const s = settings || {};
    return { order: [...tb().querySelectorAll('[data-tb]')].map(keyOf), custom: [...((s.toolbar && s.toolbar.custom) || [])], hide: [...(s.hideButtons || [])] };
  };
  const save = (c) => call('settings:set', { toolbar: { order: c.order, custom: c.custom }, hideButtons: c.hide });

  // Editing: the buttons wiggle a little, drag them to move, ✕ hides one; a sheet below lists hidden ones and lets you
  // add your own.
  let sheet = null, dragKey = null;
  function startEdit() {
    if (document.body.classList.contains('tb-edit')) return;
    document.body.classList.add('tb-edit');
    if (typeof hidePop === 'function') hidePop();
    sheet = document.createElement('div'); sheet.id = 'tbSheet'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', 'Customize toolbar');
    document.body.appendChild(sheet);
    renderSheet();
  }
  function endEdit() {
    document.body.classList.remove('tb-edit');
    if (sheet) { sheet.remove(); sheet = null; }
    for (const b of tb().querySelectorAll('[data-tb]')) { b.draggable = false; const x = b.querySelector(':scope > .tb-x'); if (x) x.remove(); }
  }
  function renderSheet() {
    if (!sheet) return;
    const s = settings || {}, hide = new Set(s.hideButtons || []), custom = (s.toolbar && s.toolbar.custom) || [];
    for (const b of tb().querySelectorAll('[data-tb]')) {
      b.draggable = true;
      if (!b.querySelector(':scope > .tb-x')) {
        const x = document.createElement('span'); x.className = 'tb-x'; x.textContent = '✕'; x.title = 'Hide';
        x.addEventListener('click', (e) => { e.stopPropagation(); const c = current(); c.hide = [...new Set([...c.hide, keyOf(b)])]; save(c); });
        b.appendChild(x);
      }
    }
    sheet.replaceChildren();
    const h = document.createElement('div'); h.className = 'tb-head';
    h.append(Object.assign(document.createElement('b'), { textContent: 'Customize toolbar' }), Object.assign(document.createElement('span'), { textContent: 'Drag the buttons to move them. ✕ hides one.' }));
    sheet.appendChild(h);
    // Hidden buttons come back with a click.
    const hidden = [...hide].filter((k) => NAMES[k] || custom.some((c) => c.id === k));
    const row = document.createElement('div'); row.className = 'tb-hidden';
    row.appendChild(Object.assign(document.createElement('small'), { textContent: hidden.length ? 'Hidden · click to show' : 'Nothing hidden' }));
    for (const k of hidden) {
      const c = custom.find((x) => x.id === k);
      const chip = Object.assign(document.createElement('button'), { className: 'pill small', textContent: '+ ' + (c ? c.name : NAMES[k]) });
      chip.addEventListener('click', () => { const cur = current(); cur.hide = cur.hide.filter((x) => x !== k); save(cur); });
      row.appendChild(chip);
    }
    sheet.appendChild(row);
    // Your own button.
    const form = document.createElement('form'); form.className = 'tb-add';
    form.appendChild(Object.assign(document.createElement('small'), { textContent: 'Add your own button' }));
    const icon = Object.assign(document.createElement('input'), { placeholder: '🔗', maxLength: 4, ariaLabel: 'Emoji (optional)', className: 'tb-icon' });
    const name = Object.assign(document.createElement('input'), { placeholder: 'Name', maxLength: 30, required: true, ariaLabel: 'Name' });
    const url = Object.assign(document.createElement('input'), { placeholder: 'Link, like youtube.com', required: true, ariaLabel: 'Link' });
    const add = Object.assign(document.createElement('button'), { type: 'submit', className: 'pill small primary', textContent: 'Add' });
    const fields = document.createElement('div'); fields.className = 'tb-fields'; fields.append(icon, name, url, add);
    form.appendChild(fields);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let u = url.value.trim(); if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
      try { new URL(u); } catch { url.focus(); return; }
      const cur = current(); const id = 'c' + Date.now().toString(36).slice(-6);
      cur.custom = [...cur.custom, { id, name: name.value.trim() || 'Link', url: u, icon: icon.value.trim() }]; cur.order = [...cur.order, id];
      save(cur);
    });
    sheet.appendChild(form);
    // Your own buttons: change or delete them.
    if (custom.length) {
      const list = document.createElement('div'); list.className = 'tb-mine';
      for (const c of custom) {
        const r = document.createElement('div'); r.className = 'tb-mine-row';
        r.append(Object.assign(document.createElement('span'), { className: 'custom-icon', textContent: c.icon || c.name.slice(0, 1).toUpperCase() }), Object.assign(document.createElement('span'), { className: 'tb-mine-name', textContent: c.name }));
        const del = Object.assign(document.createElement('button'), { className: 'pill small', textContent: 'Delete' });
        del.addEventListener('click', () => { const cur = current(); cur.custom = cur.custom.filter((x) => x.id !== c.id); cur.order = cur.order.filter((x) => x !== c.id); cur.hide = cur.hide.filter((x) => x !== c.id); save(cur); });
        r.appendChild(del); list.appendChild(r);
      }
      sheet.appendChild(list);
    }
    const foot = document.createElement('div'); foot.className = 'tb-foot';
    const reset = Object.assign(document.createElement('button'), { className: 'pill small', textContent: 'Reset' });
    reset.addEventListener('click', () => { const cur = current(); save({ order: [], custom: cur.custom, hide: [] }); });
    const done = Object.assign(document.createElement('button'), { className: 'pill small primary', textContent: 'Done' });
    done.addEventListener('click', endEdit);
    foot.append(reset, done); sheet.appendChild(foot);
  }
  // While editing, a click on a button doesn't use it.
  document.addEventListener('click', (e) => {
    if (!document.body.classList.contains('tb-edit')) return;
    const b = e.target.closest && e.target.closest('#toolbar [data-tb]');
    if (b && !e.target.closest('.tb-x')) { e.stopPropagation(); e.preventDefault(); }
  }, true);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('tb-edit')) endEdit(); });
  // Drag to move.
  tb().addEventListener('dragstart', (e) => {
    const b = e.target.closest && e.target.closest('[data-tb]');
    if (!b || !document.body.classList.contains('tb-edit')) return;
    dragKey = keyOf(b); b.classList.add('tb-dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragKey);
  });
  tb().addEventListener('dragover', (e) => {
    if (!dragKey) return;
    const over = e.target.closest && e.target.closest('[data-tb]');
    const moving = tb().querySelector(`[data-tb="${dragKey}"]`);
    e.preventDefault();
    if (!over || over === moving) return;
    const r = over.getBoundingClientRect();
    tb().insertBefore(moving, e.clientX < r.left + r.width / 2 ? over : over.nextSibling);
  });
  const dropped = () => {
    if (!dragKey) return;
    const b = tb().querySelector(`[data-tb="${dragKey}"]`); if (b) b.classList.remove('tb-dragging');
    dragKey = null; save(current());
  };
  tb().addEventListener('drop', (e) => { e.preventDefault(); dropped(); });
  tb().addEventListener('dragend', dropped);
  // Right-click the toolbar (not the address bar) to customize it.
  tb().addEventListener('contextmenu', (e) => {
    if (e.target.closest('#omnibox')) return;
    e.preventDefault();
    if (typeof showPopAt !== 'function') return startEdit();
    const pop = document.getElementById('popover'); pop.innerHTML = ''; pop.className = 'pop';
    const item = Object.assign(document.createElement('button'), { className: 'menu-item', textContent: 'Customize toolbar…' });
    item.addEventListener('click', startEdit); pop.appendChild(item);
    showPopAt(pop, e.clientX, e.clientY);
  });
  window.customizeToolbar = startEdit;
  window.applyCustomize();
})();
