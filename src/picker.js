'use strict';
/* "Who's browsing?" — shown at launch when there's more than one profile. */
const COLORS = { clay: '#D97757', sand: '#C9A15A', sage: '#7C9A6E', teal: '#5E9A94', sky: '#6A8FB5', plum: '#9B6A8E', rose: '#C96A7A', slate: '#8A857A' };
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
let color = 'sky';
async function render() {
  const { list, show } = await window.picker.list();
  $('showAgain').checked = show;
  const grid = $('grid'); grid.replaceChildren();
  list.forEach((p, i) => {
    const b = el('button', 'card'); b.style.animationDelay = (i * 0.05) + 's';
    const av = el('span', 'avatar', (p.name || '?').trim()[0].toUpperCase()); av.style.background = COLORS[p.color] || COLORS.clay;
    b.append(av, el('b', null, p.name || 'Profile'), el('small', null, p.email || (p.id === 'default' ? 'Main profile' : '')));
    b.addEventListener('click', () => { b.classList.add('chosen'); window.picker.choose(p.id); });
    grid.appendChild(b);
  });
  const add = el('button', 'card add'); add.append(el('span', 'avatar plus', '+'), el('b', null, 'Add profile'), el('small', null, ''));
  add.addEventListener('click', () => { $('addForm').classList.remove('hidden'); grid.classList.add('hidden'); $('addName').focus(); });
  grid.appendChild(add);
}
$('colors').replaceChildren(...Object.entries(COLORS).map(([k, c]) => { const s = el('button', 'sw' + (k === color ? ' on' : '')); s.type = 'button'; s.style.background = c; s.addEventListener('click', () => { color = k; document.querySelectorAll('.sw').forEach((x) => x.classList.toggle('on', x === s)); }); return s; }));
$('cancelAdd').addEventListener('click', () => { $('addForm').classList.add('hidden'); $('grid').classList.remove('hidden'); });
$('addForm').addEventListener('submit', (e) => { e.preventDefault(); window.picker.add({ name: $('addName').value.trim(), color }); });
$('showAgain').addEventListener('change', () => window.picker.setShow($('showAgain').checked));
addEventListener('keydown', (e) => { if (e.key === 'Escape') window.picker.choose('default'); });
if (window.picker.platform === 'darwin') document.body.classList.add('mac');
render();
