'use strict';
/* Profile button + app grid (top-right of the toolbar, like Chrome).
   Uses renderer.js globals (settings, call, $, el, svg, toast, newTab, openInternal, showPopAt, hidePop, hostOf, faviconFor, activeTab, GROUP_COLORS). */
const MAIL_SERVICES = {
  gmail: { name: 'Gmail', url: 'https://mail.google.com' },
  proton: { name: 'Proton Mail', url: 'https://mail.proton.me' },
  outlook: { name: 'Outlook', url: 'https://outlook.live.com/mail' },
  icloud: { name: 'iCloud Mail', url: 'https://www.icloud.com/mail' },
  yahoo: { name: 'Yahoo Mail', url: 'https://mail.yahoo.com' },
  tuta: { name: 'Tuta', url: 'https://app.tuta.com' },
  custom: { name: 'Other…', url: '' }
};
const PROFILE_COLORS = ['clay', 'sand', 'sage', 'teal', 'sky', 'plum', 'rose', 'slate'];
let launcher = [];
let gridEditing = false;

const mailUrl = () => {
  if (settings.mail === 'custom' && /^https?:\/\//i.test(settings.mailUrl || '')) return settings.mailUrl;
  return (MAIL_SERVICES[settings.mail] || MAIL_SERVICES.gmail).url || MAIL_SERVICES.gmail.url;
};
const mailName = () => (settings.mail === 'custom' && settings.mailUrl ? hostOf(settings.mailUrl) : (MAIL_SERVICES[settings.mail] || MAIL_SERVICES.gmail).name);
const appUrl = (it) => (it.url === 'mail' ? mailUrl() : it.url);
const profileColor = () => GROUP_COLORS[settings.profileColor] || GROUP_COLORS.clay;
const initial = () => ((settings.name || '').trim()[0] || '').toUpperCase();

function avatarEl(size) {
  const a = el('span', 'avatar');
  a.style.background = profileColor();
  if (size) { a.style.width = a.style.height = size + 'px'; a.style.fontSize = Math.round(size * 0.44) + 'px'; }
  if (initial()) a.textContent = initial();
  else a.appendChild(svg('<circle cx="12" cy="9" r="3.6"/><path d="M5.5 19.5c1.2-3.3 3.6-5 6.5-5s5.3 1.7 6.5 5"/>'));
  return a;
}
function renderProfileBtn() {
  const b = $('profileBtn');
  b.replaceChildren(avatarEl());
  b.title = settings.name ? `${settings.name}${settings.email ? ' · ' + settings.email : ''}` : 'Profile';
}
const anchorBelow = (btn, pop) => { const r = btn.getBoundingClientRect(); showPopAt(pop, r.right - pop.getBoundingClientRect().width, r.bottom + 6); };
const isOpen = (cls) => { const p = $('popover'); return !p.classList.contains('hidden') && p.classList.contains(cls); };

/* ---------------- profile card ---------------- */
function profileCard(editing = false) {
  const pop = $('popover'); pop.innerHTML = ''; pop.className = 'pop profile-pop';
  const head = el('div', 'pf-head');
  head.style.setProperty('--pc', profileColor());
  head.appendChild(avatarEl(64));
  head.appendChild(el('div', 'pf-name serif', settings.name || 'Your profile'));
  if (settings.email) head.appendChild(el('div', 'pf-email', settings.email));
  pop.appendChild(head);

  if (editing) {
    const f = el('form', 'stack pf-form');
    const name = el('input', 'text-in'); name.placeholder = 'Your name'; name.maxLength = 40; name.value = settings.name || '';
    const email = el('input', 'text-in'); email.placeholder = 'Email (optional)'; email.type = 'email'; email.maxLength = 120; email.value = settings.email || '';
    const sw = el('div', 'pf-swatches');
    let color = settings.profileColor || 'clay';
    for (const c of PROFILE_COLORS) {
      const s = el('button', 'pf-swatch' + (c === color ? ' on' : '')); s.type = 'button'; s.title = c; s.style.background = GROUP_COLORS[c];
      s.addEventListener('click', () => { color = c; sw.querySelectorAll('.pf-swatch').forEach((x) => x.classList.toggle('on', x === s)); });
      sw.appendChild(s);
    }
    const row = el('div', 'pop-actions'); const cancel = el('button', 'pill', 'Cancel'); cancel.type = 'button'; const ok = el('button', 'pill solid', 'Save'); ok.type = 'submit';
    cancel.addEventListener('click', () => profileCard(false));
    row.append(el('div', 'grow'), cancel, ok);
    f.append(name, email, el('div', 'pop-sub', 'Color'), sw, row);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      settings = await call('settings:set', { name: name.value.trim(), email: email.value.trim(), profileColor: color });
      renderProfileBtn(); profileCard(false);
    });
    pop.appendChild(f);
    anchorBelow($('profileBtn'), pop); name.focus();
    return;
  }

  const edit = el('button', 'pill pf-edit', settings.name ? 'Customize profile' : 'Set up your profile');
  edit.addEventListener('click', () => profileCard(true));
  pop.appendChild(edit);

  // Mail: any provider, from Gmail to Proton.
  pop.appendChild(el('div', 'pop-sub', 'Mail'));
  const mailRow = el('div', 'pf-mail');
  const sel = el('select', 'input');
  for (const [k, v] of Object.entries(MAIL_SERVICES)) { const o = el('option', null, v.name); o.value = k; sel.appendChild(o); }
  sel.value = MAIL_SERVICES[settings.mail] ? settings.mail : 'gmail';
  const open = el('button', 'pill solid', 'Open'); open.title = 'Open your mail in a new tab';
  open.addEventListener('click', () => { hidePop(); newTab(mailUrl()); });
  mailRow.append(sel, open);
  pop.appendChild(mailRow);
  const custom = el('input', 'text-in pf-custom'); custom.placeholder = 'https://your-mail.example'; custom.value = settings.mailUrl || '';
  custom.classList.toggle('hidden', sel.value !== 'custom');
  const saveCustom = () => { let u = custom.value.trim(); if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u; call('settings:set', { mail: 'custom', mailUrl: u }).then((s) => { settings = s; }); };
  custom.addEventListener('change', saveCustom);
  custom.addEventListener('keydown', (e) => { if (e.key === 'Enter') { saveCustom(); custom.blur(); } });
  sel.addEventListener('change', async () => {
    custom.classList.toggle('hidden', sel.value !== 'custom');
    settings = await call('settings:set', { mail: sel.value });
    if (sel.value === 'custom') custom.focus(); else toast(`Mail set to ${MAIL_SERVICES[sel.value].name}`);
  });
  pop.appendChild(custom);

  // Other profiles (each opens as its own browser with separate data).
  pop.appendChild(el('div', 'pop-sub', 'Profiles'));
  const plist = el('div', 'pf-profiles'); pop.appendChild(plist);
  call('profiles:list').then(({ current, list }) => {
    for (const p of list) {
      if (p.id === current) continue;
      const row = el('div', 'pf-prow');
      const b = el('button', 'menu-item pf-link');
      const a = el('span', 'avatar'); a.style.background = GROUP_COLORS[p.color] || GROUP_COLORS.clay; a.textContent = (p.name || '?')[0].toUpperCase();
      b.append(a, el('span', 'ml', p.name)); b.title = `Open ${p.name}’s browser`;
      b.addEventListener('click', () => { hidePop(); switchOverlay(p); call('profiles:open', p.id); });
      row.appendChild(b);
      if (p.id !== 'default') {
        const x = el('button', 'icon-btn small pf-del'); x.title = `Remove ${p.name}`; x.appendChild(svg('<path d="M6 6l12 12M18 6L6 18"/>'));
        x.addEventListener('click', () => {
          if (x.classList.contains('confirm')) { call('profiles:remove', p.id).then(() => { toast(`${p.name} moved to the Trash`); profileCard(false); }); return; }
          x.classList.add('confirm'); x.title = 'Click again to remove (its data goes to the Trash)'; toast(`Click × again to remove ${p.name}`);
        });
        row.appendChild(x);
      }
      plist.appendChild(row);
    }
    const add = el('button', 'menu-item pf-link'); const plus = el('span', 'avatar pf-plus'); plus.appendChild(svg('<path d="M12 6v12M6 12h12"/>'));
    add.append(plus, el('span', 'ml', 'Add profile'));
    add.addEventListener('click', () => addProfileForm());
    plist.appendChild(add);
  }).catch(() => {});

  pop.appendChild(el('div', 'sep'));
  const links = [
    ['Passwords', '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', () => openUrlInternal('settings', '#passwords')],
    ['Bookmarks', '<path d="M7 4h10v16l-5-3.5L7 20z"/>', () => openInternal('bookmarks')],
    ['History', '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>', () => openInternal('history')],
    ['Open private window', '<path d="M4 12c2.5-4 5.2-6 8-6s5.5 2 8 6c-2.5 4-5.2 6-8 6s-5.5-2-8-6z"/><path d="M4 4l16 16"/>', () => call('win:new', { incognito: true })],
    ['Settings', '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>', () => openInternal('settings')]
  ];
  for (const [label, ic, fn] of links) {
    const b = el('button', 'menu-item pf-link'); b.appendChild(svg(ic)); b.appendChild(el('span', 'ml', label));
    b.addEventListener('click', () => { hidePop(); fn(); });
    pop.appendChild(b);
  }
  anchorBelow($('profileBtn'), pop);
}
// A soft full-window transition while the other profile's browser opens.
function switchOverlay(p) {
  const o = el('div', 'switch-overlay');
  const a = el('span', 'avatar'); a.style.background = GROUP_COLORS[p.color] || GROUP_COLORS.clay; a.textContent = (p.name || '?').trim()[0].toUpperCase();
  o.append(a, el('div', 'so-text', `Switching to ${p.name}…`));
  document.body.appendChild(o);
  requestAnimationFrame(() => o.classList.add('in'));
  setTimeout(() => { o.classList.remove('in'); setTimeout(() => o.remove(), 400); }, 1400);
}
function addProfileForm() {
  const pop = $('popover'); pop.innerHTML = ''; pop.className = 'pop profile-pop';
  pop.appendChild(el('div', 'pop-title serif pf-addtitle', 'Add a profile'));
  pop.appendChild(el('div', 'pop-note pf-addnote', 'A profile is a separate browser with its own logins, history, bookmarks and passwords. Great for work vs. personal, or sharing the computer.'));
  const f = el('form', 'stack pf-form');
  const name = el('input', 'text-in'); name.placeholder = 'Name (e.g. Work)'; name.maxLength = 40; name.required = true;
  const sw = el('div', 'pf-swatches'); let color = 'sky';
  for (const c of PROFILE_COLORS) {
    const s = el('button', 'pf-swatch' + (c === color ? ' on' : '')); s.type = 'button'; s.style.background = GROUP_COLORS[c];
    s.addEventListener('click', () => { color = c; sw.querySelectorAll('.pf-swatch').forEach((x) => x.classList.toggle('on', x === s)); });
    sw.appendChild(s);
  }
  const row = el('div', 'pop-actions'); const back = el('button', 'pill', 'Back'); back.type = 'button'; back.addEventListener('click', () => profileCard(false));
  const ok = el('button', 'pill solid', 'Create & open'); ok.type = 'submit'; row.append(el('div', 'grow'), back, ok);
  f.append(name, el('div', 'pop-sub', 'Color'), sw, row);
  f.addEventListener('submit', async (e) => { e.preventDefault(); const p = await call('profiles:create', { name: name.value.trim(), color }); hidePop(); toast(p ? `Opening ${p.name}…` : 'Couldn’t create the profile'); });
  pop.appendChild(f);
  anchorBelow($('profileBtn'), pop); name.focus();
}
$('profileBtn').addEventListener('click', () => { if (isOpen('profile-pop')) hidePop(); else profileCard(false); });

/* ---------------- app grid ---------------- */
function appIcon(it) {
  const box = el('span', 'ag-icon');
  const letter = () => { box.replaceChildren(el('b', null, (it.name || '?')[0].toUpperCase())); box.classList.add('letter'); };
  const sources = iconSources(appUrl(it));
  if (sources.length) { const i = el('img'); i.draggable = false; box.appendChild(i); loadIcon(i, sources, letter); } else letter();
  return box;
}
let gridDrag = null;
function appGrid() {
  const pop = $('popover'); pop.innerHTML = ''; pop.className = 'pop grid-pop' + (gridEditing ? ' editing' : '');
  const head = el('div', 'ag-head');
  head.appendChild(el('div', 'pop-title serif', gridEditing ? 'Edit apps' : 'Apps'));
  head.appendChild(el('div', 'grow'));
  const editBtn = el('button', 'pill small' + (gridEditing ? ' active' : ''), gridEditing ? 'Done' : 'Edit');
  editBtn.addEventListener('click', () => { gridEditing = !gridEditing; appGrid(); });
  head.appendChild(editBtn);
  pop.appendChild(head);

  const grid = el('div', 'ag-grid');
  launcher.forEach((it, i) => {
    const t = el('button', 'ag-tile'); t.title = it.url === 'mail' ? `${it.name} (${mailName()})` : appUrl(it);
    t.append(appIcon(it), el('span', 'ag-name', it.name));
    if (gridEditing) {
      const x = el('span', 'ag-del'); x.title = 'Remove'; x.appendChild(svg('<path d="M7 7l10 10M17 7L7 17"/>'));
      x.addEventListener('click', (e) => { e.stopPropagation(); launcher.splice(i, 1); saveLauncher(); });
      t.appendChild(x);
      t.draggable = true;
      t.addEventListener('dragstart', (e) => { gridDrag = i; e.dataTransfer.effectAllowed = 'move'; t.classList.add('dragging'); });
      t.addEventListener('dragend', () => { gridDrag = null; t.classList.remove('dragging'); });
      t.addEventListener('dragover', (e) => { if (gridDrag != null) { e.preventDefault(); t.classList.add('drop'); } });
      t.addEventListener('dragleave', () => t.classList.remove('drop'));
      t.addEventListener('drop', (e) => { e.preventDefault(); if (gridDrag == null || gridDrag === i) return; const [m] = launcher.splice(gridDrag, 1); launcher.splice(i, 0, m); saveLauncher(); });
      t.addEventListener('click', () => appForm(it));
    } else {
      t.addEventListener('click', (e) => { hidePop(); newTab(appUrl(it), { activate: !(e.ctrlKey || e.metaKey) }); });
      t.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); newTab(appUrl(it), { activate: false }); } });
    }
    grid.appendChild(t);
  });
  const add = el('button', 'ag-tile ag-add'); const plus = el('span', 'ag-icon letter'); plus.appendChild(svg('<path d="M12 5v14M5 12h14"/>'));
  add.append(plus, el('span', 'ag-name', 'Add app'));
  add.addEventListener('click', () => appForm(null));
  grid.appendChild(add);
  pop.appendChild(grid);

  if (gridEditing) {
    const foot = el('div', 'pop-actions');
    foot.appendChild(el('span', 'pop-note', 'Drag to reorder · click an app to rename it'));
    foot.appendChild(el('div', 'grow'));
    const reset = el('button', 'pill small', 'Reset');
    reset.addEventListener('click', async () => { launcher = await call('launcher:defaults'); saveLauncher(); });
    foot.appendChild(reset);
    pop.appendChild(foot);
  }
  anchorBelow($('gridBtn'), pop);
}
function appForm(it) {
  const pop = $('popover'); pop.innerHTML = ''; pop.className = 'pop grid-pop';
  pop.appendChild(el('div', 'pop-title serif', it ? 'Edit app' : 'Add an app'));
  const f = el('form', 'stack');
  const name = el('input', 'text-in'); name.placeholder = 'Name (e.g. Notion)'; name.required = true; name.maxLength = 40;
  const url = el('input', 'text-in'); url.placeholder = 'https://…'; url.required = true;
  if (it) { name.value = it.name; url.value = it.url === 'mail' ? '' : it.url; if (it.url === 'mail') { url.required = false; url.disabled = true; url.placeholder = `Opens your mail (${mailName()})`; } }
  else { const cur = activeTab(); if (cur && /^https?:/.test(cur.url)) { url.value = new URL(cur.url).origin; name.value = (cur.title || hostOf(cur.url)).slice(0, 40); } }
  const row = el('div', 'pop-actions');
  const back = el('button', 'pill', 'Back'); back.type = 'button'; back.addEventListener('click', appGrid);
  const ok = el('button', 'pill solid', it ? 'Save' : 'Add'); ok.type = 'submit';
  row.append(el('div', 'grow'), back, ok);
  f.append(name, url, row);
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    let u = it && it.url === 'mail' ? 'mail' : url.value.trim();
    if (u !== 'mail') { if (!/^https?:\/\//i.test(u)) u = 'https://' + u; try { new URL(u); } catch { toast('That URL does not look right'); return; } }
    if (it) Object.assign(it, { name: name.value.trim() || hostOf(u), url: u });
    else launcher.push({ id: 'l' + Date.now().toString(36), name: name.value.trim() || hostOf(u), url: u });
    saveLauncher();
  });
  pop.appendChild(f);
  anchorBelow($('gridBtn'), pop);
  name.focus();
}
function saveLauncher() { call('launcher:set', launcher); appGrid(); }
$('gridBtn').addEventListener('click', () => { if (isOpen('grid-pop')) hidePop(); else { gridEditing = false; appGrid(); } });

// Window logo (top-left) follows the logo picked on the new tab page.
function renderBrand() {
  const m = document.querySelector('#titlebar .logo-mark'); if (!m) return;
  const kind = settings.logo || 'ring';
  m.className = 'logo-mark ' + kind; m.textContent = ''; m.style.backgroundImage = '';
  if (kind === 'emoji') m.textContent = settings.logoEmoji || '🦆';
  else if (kind === 'image' && /^data:image\//.test(settings.logoImage || '')) m.style.backgroundImage = `url("${settings.logoImage}")`;
  else if (kind === 'image') m.className = 'logo-mark ring';
}

/* ---------------- wiring ---------------- */
api.on('launcher:changed', (l) => { launcher = l; });
api.on('settings:changed', () => setTimeout(() => { renderProfileBtn(); renderBrand(); }, 0));   // renderer.js updates `settings` first
call('launcher:get').then((l) => { launcher = l; });
call('settings:get').then((s) => { if (s) { settings = Object.assign({}, settings, s); renderProfileBtn(); renderBrand(); } });
