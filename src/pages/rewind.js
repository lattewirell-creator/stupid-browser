'use strict';
/* Rewind: search and scrub through pages you've seen (stored locally by rewind-main.js). */
let items = [], query = '', st = { on: false };
const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
function dayLabel(ts) {
  const d = new Date(ts), t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((t - new Date(d).setHours(0, 0, 0, 0)) / 864e5);
  return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
}
const thumb = (x) => `stupid://rewind/thumbs/${x.id}.jpg`;
async function load() {
  st = await call('rewind:status');
  const fresh = st.count === 0;
  $('intro').classList.toggle('hidden', st.on || !fresh);
  $('app').classList.toggle('hidden', !st.on && fresh);
  $('foot').classList.toggle('hidden', !st.on && fresh);
  $('onToggle').checked = st.on;
  $('stat').textContent = `${st.count} page${st.count === 1 ? '' : 's'} · ${fmtBytes(st.bytes)}${st.on ? '' : ' · paused'}`;
  $('exList').replaceChildren(...st.exclude.map((d) => { const c = el('span', 'ex-chip', d); const x = el('button', null, '×'); x.title = 'Remove'; x.onclick = () => saveExclude(st.exclude.filter((y) => y !== d)); c.appendChild(x); return c; }));
  items = await call('rewind:search', query, 400);
  render();
}
function render() {
  const box = $('results'); box.replaceChildren();
  $('count').textContent = query ? `${items.length} found` : '';
  $('empty').classList.toggle('hidden', items.length > 0);
  $('empty').textContent = query ? `Nothing you’ve seen matches “${query}”.` : st.on ? 'Pages you look at will show up here.' : 'Rewind is paused.';
  paintScrub();
  let day = '';
  let grid;
  for (const x of items) {
    const label = query ? (day ? day : 'Best matches') : dayLabel(x.ts);
    if (label !== day) { day = label; box.appendChild(el('h2', 'day', label)); grid = el('div', 'grid'); box.appendChild(grid); }
    const card = el('a', 'card'); card.href = x.url; card.title = x.url;
    const img = el('img'); img.loading = 'lazy'; img.src = thumb(x); img.alt = ''; img.onerror = () => img.classList.add('broken');
    const meta = el('div', 'meta');
    const top = el('div', 'meta-top'); top.append(favImg(x.url), el('span', 'host', x.host), el('span', 'when', (query ? dayLabel(x.ts) + ' · ' : '') + fmtTime(x.ts)));
    meta.append(top, el('div', 'title', x.title));
    if (x.snippet) meta.appendChild(el('div', 'snippet', x.snippet));
    const del = el('button', 'del', '×'); del.title = 'Forget this page';
    del.onclick = async (e) => { e.preventDefault(); e.stopPropagation(); await call('rewind:delete', [x.id]); card.classList.add('gone'); setTimeout(load, 250); };
    card.append(img, meta, del);
    grid.appendChild(card);
  }
}
// The time slider: oldest on the left, now on the right.
function paintScrub() {
  const list = query ? [] : items.slice().reverse();
  $('scrub').classList.toggle('hidden', list.length < 2);
  if (list.length < 2) return;
  const r = $('scrubRange'); r.max = list.length - 1; if (+r.value > list.length - 1 || !r.dataset.touched) r.value = list.length - 1;
  $('scrubOld').textContent = dayLabel(list[0].ts);
  const show = () => { const x = list[+r.value]; $('scrubImg').src = thumb(x); $('scrubTitle').textContent = x.title; $('scrubWhen').textContent = `${dayLabel(x.ts)} · ${fmtTime(x.ts)} · ${x.host}`; $('scrubOpen').onclick = () => { location.href = x.url; }; };
  r.oninput = () => { r.dataset.touched = '1'; show(); };
  show();
}
let qT;
$('q').addEventListener('input', () => { clearTimeout(qT); qT = setTimeout(async () => { query = $('q').value.trim(); items = await call('rewind:search', query, 400); render(); }, 120); });
$('turnOn').onclick = async () => { await call('settings:set', { rewind: true }); toast('Rewind is on — pages you look at will show up here'); load(); };
$('onToggle').onchange = async () => { await call('settings:set', { rewind: $('onToggle').checked }); load(); };
const saveExclude = async (list) => { await call('settings:set', { rewindExclude: list }); load(); };
$('exForm').addEventListener('submit', (e) => { e.preventDefault(); const v = $('exIn').value.trim(); if (!v) return; $('exIn').value = ''; saveExclude([...st.exclude, v]); });
let clearArmed = false;
$('clearAll').onclick = async () => {
  if (!clearArmed) { clearArmed = true; $('clearAll').textContent = 'Click again to clear everything'; setTimeout(() => { clearArmed = false; $('clearAll').textContent = 'Clear everything'; }, 3000); return; }
  await call('rewind:clear'); clearArmed = false; $('clearAll').textContent = 'Clear everything'; toast('Rewind cleared'); load();
};
S.on('rewind:changed', load);
load();
setTimeout(() => $('q') && $('q').focus(), 100);
