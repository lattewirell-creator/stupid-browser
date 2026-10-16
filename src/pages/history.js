'use strict';
let items = [], selected = new Set(), limit = 300;
const dayLabel = (ts) => {
  const d = new Date(ts), today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  const date = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
  return diff === 0 ? 'Today — ' + date : diff === 1 ? 'Yesterday — ' + date : date;
};
async function load() {
  items = await call('history:query', $('q').value, limit);
  render();
}
function render() {
  const list = $('list'); list.innerHTML = '';
  if (!items.length) { list.appendChild(el('div', 'empty', $('q').value ? 'No history matches your search.' : 'Pages you visit will show up here.')); }
  let day = '', card = null;
  for (const it of items) {
    const dl = dayLabel(it.ts);
    if (dl !== day) { day = dl; list.appendChild(el('div', 'day', dl)); card = el('div', 'card'); list.appendChild(card); }
    const row = el('div', 'item');
    const cb = el('input'); cb.type = 'checkbox'; cb.checked = selected.has(it.id);
    cb.onchange = () => { if (cb.checked) selected.add(it.id); else selected.delete(it.id); updateSel(); };
    row.appendChild(cb);
    row.appendChild(el('span', 'time', new Date(it.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })));
    row.appendChild(favImg(it.url));
    const t = el('div', 't'); const a = el('a', null, it.title || it.url); a.href = it.url; a.title = it.url;
    t.append(a, el('span', 'h', hostOf(it.url))); row.appendChild(t);
    const x = el('button', 'icon-btn'); x.title = 'Remove from history'; x.appendChild(icon(X_ICON));
    x.onclick = async () => { await call('history:delete', [it.id]); items = items.filter((i) => i !== it); render(); };
    row.appendChild(x);
    card.appendChild(row);
  }
  $('more').classList.toggle('hidden', items.length < limit);
  updateSel();
}
function updateSel() {
  $('delSel').classList.toggle('hidden', !selected.size);
  $('selInfo').textContent = selected.size ? `${selected.size} selected` : '';
}
$('delSel').onclick = async () => { await call('history:delete', [...selected]); selected.clear(); load(); toast('Deleted'); };
$('moreBtn').onclick = () => { limit += 300; load(); };
let t; $('q').oninput = () => { clearTimeout(t); t = setTimeout(load, 120); };
load();
