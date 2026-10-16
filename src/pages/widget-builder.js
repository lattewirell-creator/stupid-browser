'use strict';
/* Make-your-own widgets. A custom widget = title + emoji + color theme + size + a list of blocks
   (text, links, photo, counter, habit). Templates are pre-filled block lists. Everything is rendered
   with textContent / validated URLs; no user HTML or scripts run on this privileged page.
   Uses widgets.js (widgets, RENDER, saveWidgets, renderWidgets, paintWidgetPicker) and common.js helpers. */
const W_THEMES = {
  paper: 'Paper', clay: 'Clay', sunset: 'Sunset', ocean: 'Ocean', forest: 'Forest', grape: 'Grape', mint: 'Mint', night: 'Night'
};
const W_EMOJI = ['✨', '💧', '📚', '🏃', '🔗', '📷', '💬', '🎯', '🌱', '☕', '🎵', '❤️'];
const BLOCKS = {
  text: { name: 'Text', icon: '¶', make: () => ({ k: 'text', text: '', big: false }) },
  links: { name: 'Links', icon: '🔗', make: () => ({ k: 'links', items: [{ label: '', url: '' }] }) },
  photo: { name: 'Photo', icon: '📷', make: () => ({ k: 'photo', src: '' }) },
  counter: { name: 'Counter', icon: '#', make: () => ({ k: 'counter', label: 'Count', value: 0, goal: 0 }) },
  habit: { name: 'Habit', icon: '✓', make: () => ({ k: 'habit', label: 'Habit', days: {} }) }
};
const W_TEMPLATES = [
  { id: 'blank', name: 'From scratch', emoji: '✨', theme: 'paper', size: 'm', blocks: [] },
  { id: 'quote', name: 'Quote card', emoji: '💬', theme: 'sunset', size: 'm', title: 'Daily reminder', blocks: [{ k: 'text', text: 'Small steps every day.', big: true }] },
  { id: 'links', name: 'Quick links', emoji: '🔗', theme: 'paper', size: 'm', title: 'Quick links', blocks: [{ k: 'links', items: [{ label: 'Wikipedia', url: 'https://www.wikipedia.org' }, { label: 'Hacker News', url: 'https://news.ycombinator.com' }] }] },
  { id: 'photo', name: 'Photo frame', emoji: '📷', theme: 'night', size: 'm', title: 'Favorite photo', blocks: [{ k: 'photo', src: '' }] },
  { id: 'water', name: 'Water tracker', emoji: '💧', theme: 'ocean', size: 's', title: 'Water', blocks: [{ k: 'counter', label: 'glasses today', value: 0, goal: 8 }] },
  { id: 'habit', name: 'Habit tracker', emoji: '🏃', theme: 'forest', size: 'm', title: 'Workout', blocks: [{ k: 'habit', label: 'Did I move today?', days: {} }] },
  { id: 'reading', name: 'Reading goal', emoji: '📚', theme: 'grape', size: 's', title: 'Reading', blocks: [{ k: 'counter', label: 'pages', value: 0, goal: 300 }] }
];
const safeUrl = (u) => { try { const x = new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; } };
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function styleCustomCard(card, w) {
  card.dataset.theme = W_THEMES[w.config.theme] ? w.config.theme : 'paper';
  card.dataset.size = ['s', 'm', 'l'].includes(w.config.size) ? w.config.size : 'm';
}

/* ---------------- rendering a custom widget ---------------- */
RENDER.custom = (w, body, card, opts = {}) => {
  const c = w.config; const blocks = Array.isArray(c.blocks) ? c.blocks : (c.blocks = []);
  const t = card.querySelector('.w-title'); if (t) t.textContent = `${c.emoji || '✨'}  ${c.title || 'My widget'}`;
  const persist = opts.preview ? () => {} : () => saveWidgets();
  if (!blocks.length) body.appendChild(el('div', 'w-muted', opts.preview ? 'Add blocks on the left.' : 'Empty widget — click ✎ to add something.'));
  for (const b of blocks) {
    if (b.k === 'text') body.appendChild(el('p', 'cb-text' + (b.big ? ' big' : ''), b.text || ''));
    else if (b.k === 'links') {
      const ul = el('div', 'cb-links');
      for (const it of b.items || []) {
        const u = safeUrl(it.url || ''); if (!u) continue;
        const a = el('a', 'cb-link'); a.href = u; a.title = u;
        const im = el('img'); im.src = favFor(u); im.onerror = () => im.remove();
        a.append(im, el('span', null, it.label || hostOf(u)));
        ul.appendChild(a);
      }
      body.appendChild(ul);
    } else if (b.k === 'photo') {
      if (/^data:image\/(jpeg|png|webp);base64,/.test(b.src || '')) { const f = el('div', 'cb-photo'); f.style.backgroundImage = `url("${b.src}")`; body.appendChild(f); }
      else body.appendChild(el('div', 'cb-photo empty', '📷'));
    } else if (b.k === 'counter') {
      const row = el('div', 'cb-counter');
      const num = el('span', 'cb-num', String(b.value || 0));
      const minus = el('button', 'cb-step', '−'); const plus = el('button', 'cb-step', '+');
      const lab = el('span', 'cb-label', (b.goal ? `of ${b.goal} ` : '') + (b.label || ''));
      const bar = el('div', 'cb-bar'); const fillBar = el('i'); bar.appendChild(fillBar);
      const upd = () => { num.textContent = String(b.value); fillBar.style.width = b.goal ? Math.min(100, b.value / b.goal * 100) + '%' : '0'; card.classList.toggle('goal-met', !!b.goal && b.value >= b.goal); };
      minus.addEventListener('click', () => { b.value = Math.max(0, (+b.value || 0) - 1); upd(); persist(); });
      plus.addEventListener('click', () => { b.value = (+b.value || 0) + 1; upd(); persist(); });
      const mid = el('div', 'cb-mid'); mid.append(num, lab);
      row.append(minus, mid, plus);
      body.appendChild(row); if (b.goal) body.appendChild(bar);
      upd();
    } else if (b.k === 'habit') {
      body.appendChild(el('div', 'cb-label habit-label', b.label || ''));
      const row = el('div', 'cb-habit'); b.days = b.days && typeof b.days === 'object' ? b.days : {};
      const today = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today); d.setDate(today.getDate() - i); const k = dayKey(d);
        const dot = el('button', 'cb-day' + (b.days[k] ? ' on' : '') + (i === 0 ? ' today' : ''));
        dot.append(el('small', null, d.toLocaleDateString([], { weekday: 'narrow' })), el('span', null, b.days[k] ? '✓' : ''));
        dot.title = d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' });
        dot.addEventListener('click', () => { if (b.days[k]) delete b.days[k]; else b.days[k] = true; dot.classList.toggle('on', !!b.days[k]); dot.lastChild.textContent = b.days[k] ? '✓' : ''; persist(); });
        row.appendChild(dot);
      }
      // keep only the last 60 days
      for (const k of Object.keys(b.days)) if (Date.now() - new Date(k + 'T12:00') > 60 * 864e5) delete b.days[k];
      const streak = (() => { let n = 0; const d = new Date(today); if (!b.days[dayKey(d)]) d.setDate(d.getDate() - 1); while (b.days[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); } return n; })();
      body.append(row, el('div', 'cb-streak', streak ? `🔥 ${streak}-day streak` : 'Start a streak today'));
    }
  }
};

/* ---------------- editor ---------------- */
let editor = null;
function openWidgetEditor(existing, templateId) {
  closeWidgetEditor();
  const tpl = W_TEMPLATES.find((x) => x.id === templateId) || W_TEMPLATES[0];
  const draft = existing ? JSON.parse(JSON.stringify(existing)) : {
    id: 'w' + Date.now().toString(36), type: 'custom',
    config: { title: tpl.title || 'My widget', emoji: tpl.emoji, theme: tpl.theme, size: tpl.size, blocks: JSON.parse(JSON.stringify(tpl.blocks)) }
  };
  const c = draft.config;
  const shade = el('div', 'wb-shade'); const dlg = el('div', 'wb-dialog'); dlg.setAttribute('role', 'dialog'); shade.appendChild(dlg);
  editor = shade;
  shade.addEventListener('mousedown', (e) => { if (e.target === shade) closeWidgetEditor(); });
  const form = el('div', 'wb-form'); const prevWrap = el('div', 'wb-preview');
  dlg.append(form, prevWrap);

  const head = el('div', 'cz-head'); head.appendChild(el('h3', 'serif', existing ? 'Edit widget' : 'New widget'));
  const xb = el('button', 'icon-x'); xb.title = 'Close'; xb.appendChild(icon('<path d="M6 6l12 12M18 6L6 18"/>')); xb.addEventListener('click', closeWidgetEditor); head.appendChild(xb);
  form.appendChild(head);

  if (!existing) {
    form.appendChild(el('div', 'cz-label', 'Start from'));
    const tp = el('div', 'wb-templates');
    for (const t of W_TEMPLATES) {
      const b = el('button', 'wb-tpl' + (t.id === tpl.id ? ' on' : ''));
      b.append(el('span', null, t.emoji), el('small', null, t.name));
      b.addEventListener('click', () => openWidgetEditor(null, t.id));
      tp.appendChild(b);
    }
    form.appendChild(tp);
  }
  const field = (label, node) => { const l = el('label', 'w-field'); l.appendChild(el('span', null, label)); l.appendChild(node); form.appendChild(l); return node; };
  const title = field('Title', el('input', 'cz-input')); title.maxLength = 40; title.value = c.title || '';
  title.addEventListener('input', () => { c.title = title.value; preview(); });
  const emo = el('div', 'wb-emoji');
  const emoIn = el('input', 'cz-input'); emoIn.maxLength = 8; emoIn.value = c.emoji || ''; emoIn.style.width = '64px';
  emoIn.addEventListener('input', () => { c.emoji = emoIn.value.trim(); preview(); });
  emo.appendChild(emoIn);
  for (const e of W_EMOJI) { const b = el('button', null, e); b.addEventListener('click', () => { c.emoji = e; emoIn.value = e; preview(); }); emo.appendChild(b); }
  field('Emoji', emo);
  const th = el('div', 'wb-themes');
  for (const [k, n] of Object.entries(W_THEMES)) {
    const b = el('button', 'wb-theme' + (c.theme === k ? ' on' : '')); b.dataset.theme = k; b.title = n;
    b.addEventListener('click', () => { c.theme = k; th.querySelectorAll('.wb-theme').forEach((x) => x.classList.toggle('on', x === b)); preview(); });
    th.appendChild(b);
  }
  field('Color', th);
  const sz = el('div', 'wb-sizes');
  for (const [k, n] of [['s', 'Small'], ['m', 'Medium'], ['l', 'Wide']]) {
    const b = el('button', c.size === k ? 'on' : '', n);
    b.addEventListener('click', () => { c.size = k; sz.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); preview(); });
    sz.appendChild(b);
  }
  field('Size', sz);

  form.appendChild(el('div', 'cz-label', 'Blocks'));
  const blockBox = el('div', 'wb-blocks'); form.appendChild(blockBox);
  const adders = el('div', 'wb-add');
  for (const [k, b] of Object.entries(BLOCKS)) {
    const btn = el('button', 'pill-btn'); btn.append(el('b', null, b.icon), el('span', null, b.name));
    btn.addEventListener('click', () => { if (c.blocks.length >= 8) return toast('Up to 8 blocks per widget'); c.blocks.push(b.make()); drawBlocks(); preview(); });
    adders.appendChild(btn);
  }
  form.appendChild(adders);

  const actions = el('div', 'wb-actions');
  if (existing) {
    const del = el('button', 'btn danger', 'Delete widget');
    del.addEventListener('click', () => { const i = widgets.findIndex((x) => x.id === existing.id); if (i >= 0) widgets.splice(i, 1); saveWidgets(true); renderWidgets(); paintWidgetPicker(); closeWidgetEditor(); });
    actions.appendChild(del);
  }
  actions.appendChild(el('div', 'grow'));
  const cancel = el('button', 'btn', 'Cancel'); cancel.addEventListener('click', closeWidgetEditor);
  const save = el('button', 'btn primary', existing ? 'Save' : 'Add widget');
  save.addEventListener('click', () => {
    c.title = (c.title || '').trim() || 'My widget';
    for (const b of c.blocks) if (b.k === 'links') b.items = (b.items || []).map((it) => ({ label: (it.label || '').trim(), url: safeUrl((it.url || '').trim()) })).filter((it) => it.url);
    const i = widgets.findIndex((x) => x.id === draft.id);
    if (i >= 0) widgets[i] = draft; else { if (widgets.length >= 20) return toast('That’s a lot of widgets. Remove one first.'); widgets.push(draft); }
    saveWidgets(true); renderWidgets(); paintWidgetPicker(); closeWidgetEditor();
  });
  actions.append(cancel, save);
  form.appendChild(actions);

  function drawBlocks() {
    blockBox.replaceChildren();
    if (!c.blocks.length) blockBox.appendChild(el('div', 'w-muted', 'No blocks yet. Add text, links, a photo, a counter or a habit below.'));
    c.blocks.forEach((b, i) => {
      const box = el('div', 'wb-block');
      const top = el('div', 'wb-block-top'); top.appendChild(el('b', null, `${BLOCKS[b.k].icon}  ${BLOCKS[b.k].name}`));
      const tools = el('div', 'grow');
      const mv = (d) => () => { const j = i + d; if (j < 0 || j >= c.blocks.length) return; [c.blocks[i], c.blocks[j]] = [c.blocks[j], c.blocks[i]]; drawBlocks(); preview(); };
      const up = el('button', 'w-tool', '↑'); up.title = 'Move up'; up.addEventListener('click', mv(-1));
      const dn = el('button', 'w-tool', '↓'); dn.title = 'Move down'; dn.addEventListener('click', mv(1));
      const rm = el('button', 'w-tool', '×'); rm.title = 'Remove block'; rm.addEventListener('click', () => { c.blocks.splice(i, 1); drawBlocks(); preview(); });
      top.append(tools, up, dn, rm); box.appendChild(top);
      const inp = (val, ph, on, attrs) => { const x = el('input', 'cz-input'); x.value = val || ''; x.placeholder = ph; Object.assign(x, attrs || {}); x.addEventListener('input', () => { on(x.value); preview(); }); return x; };
      if (b.k === 'text') {
        const ta = el('textarea', 'cz-input wb-ta'); ta.value = b.text || ''; ta.placeholder = 'Write anything…'; ta.maxLength = 1000;
        ta.addEventListener('input', () => { b.text = ta.value; preview(); });
        const big = el('label', 'wb-check'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!b.big;
        cb.addEventListener('change', () => { b.big = cb.checked; preview(); }); big.append(cb, el('span', null, 'Large text'));
        box.append(ta, big);
      } else if (b.k === 'links') {
        const list = el('div', 'wb-links');
        const drawLinks = () => {
          list.replaceChildren();
          b.items.forEach((it, j) => {
            const row = el('div', 'wb-link');
            const del = el('button', 'w-tool', '×'); del.addEventListener('click', () => { b.items.splice(j, 1); drawLinks(); preview(); });
            row.append(inp(it.label, 'Label', (v) => { it.label = v; }, { maxLength: 40 }), inp(it.url, 'https://…', (v) => { it.url = v; }), del);
            list.appendChild(row);
          });
        };
        drawLinks();
        const more = el('button', 'pill-btn small', '+ Link'); more.addEventListener('click', () => { if (b.items.length < 10) { b.items.push({ label: '', url: '' }); drawLinks(); } });
        box.append(list, more);
      } else if (b.k === 'photo') {
        const lab = el('label', 'btn'); const file = el('input'); file.type = 'file'; file.accept = 'image/*'; file.hidden = true;
        lab.append(file, el('span', null, b.src ? 'Change photo…' : 'Choose a photo…'));
        file.addEventListener('change', () => {
          const f = file.files[0]; file.value = ''; if (!f || !/^image\//.test(f.type)) return;
          const img = new Image(); const url = URL.createObjectURL(f);
          img.onload = () => {
            const max = 640, k = Math.min(1, max / Math.max(img.width, img.height));
            const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
            cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
            b.src = cv.toDataURL('image/jpeg', 0.82); drawBlocks(); preview();
          };
          img.onerror = () => { URL.revokeObjectURL(url); toast('Couldn’t read that image'); };
          img.src = url;
        });
        box.appendChild(lab);
      } else if (b.k === 'counter') {
        const row = el('div', 'wb-row');
        row.append(inp(b.label, 'What are you counting?', (v) => { b.label = v; }, { maxLength: 40 }),
          inp(b.goal || '', 'Goal (optional)', (v) => { b.goal = Math.max(0, parseInt(v, 10) || 0); }, { type: 'number', min: 0, style: 'width:110px' }));
        box.appendChild(row);
      } else if (b.k === 'habit') {
        box.appendChild(inp(b.label, 'What habit?', (v) => { b.label = v; }, { maxLength: 60 }));
      }
      blockBox.appendChild(box);
    });
  }
  function preview() {
    prevWrap.replaceChildren(el('div', 'cz-label', 'Preview'));
    const card = el('article', 'widget wt-custom preview'); styleCustomCard(card, draft);
    const h = el('div', 'w-head'); h.appendChild(el('span', 'w-title')); const body = el('div', 'w-body');
    card.append(h, body); RENDER.custom(draft, body, card, { preview: true });
    prevWrap.appendChild(card);
  }
  drawBlocks(); preview();
  document.body.appendChild(shade);
  title.focus();
}
function closeWidgetEditor() { if (editor) { editor.remove(); editor = null; } }
addEventListener('keydown', (e) => { if (e.key === 'Escape') closeWidgetEditor(); });

/* customize panel: "Make your own" row under the built-in widgets */
function paintBuilderEntry() {
  const box = $('czWidgets'); if (!box || box.querySelector('.cz-make')) return;
  const b = el('button', 'cz-wbtn cz-make'); b.append(el('span', 'cz-wic', '＋'), el('span', null, 'Make your own'));
  b.title = 'Build a widget from scratch or a template';
  b.addEventListener('click', () => openWidgetEditor(null, 'blank'));
  box.appendChild(b);
}
const _paintPicker = paintWidgetPicker;
paintWidgetPicker = function () { _paintPicker(); paintBuilderEntry(); };   // eslint-disable-line no-global-assign
paintWidgetPicker();
