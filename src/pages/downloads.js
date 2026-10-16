'use strict';
let list = [];
const ext = (n) => ((n || '').split('.').pop() || 'file').slice(0, 4);
async function load() { list = await call('downloads:list'); render(); }
function render() {
  const q = $('q').value.trim().toLowerCase();
  const box = $('list'); box.innerHTML = '';
  const shown = list.filter((d) => !q || d.filename.toLowerCase().includes(q) || d.url.toLowerCase().includes(q));
  if (!shown.length) { box.appendChild(el('div', 'empty', q ? 'No downloads match.' : 'Files you download will show up here.')); return; }
  const card = el('div', 'card'); box.appendChild(card);
  for (const d of shown) {
    const r = el('div', 'dl');
    r.appendChild(el('div', 'ficon', ext(d.filename)));
    const m = el('div', 'meta');
    const name = el('div', 'name' + (d.state === 'cancelled' || d.state === 'interrupted' ? ' gone' : ''), d.filename);
    m.appendChild(name);
    const status = d.state === 'progressing' ? `${fmtBytes(d.received)} of ${d.total ? fmtBytes(d.total) : 'unknown'}${d.paused ? ' — paused' : ''}` : d.state === 'completed' ? `${fmtBytes(d.received || d.total)} · ${new Date(d.ts).toLocaleString()}` : d.state === 'cancelled' ? 'Cancelled' : 'Failed — network or disk error';
    m.appendChild(el('div', 'src', status));
    const link = el('div', 'src ellipsis', d.url); link.title = d.url; m.appendChild(link);
    if (d.state === 'progressing') { const p = el('div', 'prog'); const f = el('div'); f.style.width = d.total ? Math.round((d.received / d.total) * 100) + '%' : '25%'; p.appendChild(f); m.appendChild(p); }
    r.appendChild(m);
    const acts = el('div', 'acts');
    const btn = (label, action, cls = '') => { const b = el('button', 'btn small ' + cls, label); b.onclick = async () => { const ok = await call('downloads:action', d.id, action); if (action === 'open' && ok === false) toast('File was moved or deleted'); }; acts.appendChild(b); };
    if (d.state === 'progressing') { btn(d.paused ? 'Resume' : 'Pause', d.paused ? 'resume' : 'pause'); btn('Cancel', 'cancel'); }
    else if (d.state === 'completed') { btn('Open', 'open', 'primary'); btn('Show in folder', 'show'); }
    else btn('Retry', 'retry');
    const x = el('button', 'icon-btn'); x.title = 'Remove from list'; x.appendChild(icon(X_ICON));
    x.onclick = () => call('downloads:action', d.id, 'remove');
    if (d.state !== 'progressing') acts.appendChild(x);
    r.appendChild(acts);
    card.appendChild(r);
  }
}
$('q').oninput = render;
$('clearAll').onclick = () => call('downloads:clear');
S.on('downloads:update', (d) => { const i = list.findIndex((x) => x.id === d.id); if (i >= 0) list[i] = d; else list.unshift(d); render(); });
S.on('downloads:started', (d) => { if (!list.some((x) => x.id === d.id)) list.unshift(d); render(); });
S.on('downloads:removed', (id) => { list = list.filter((x) => x.id !== id); render(); });
S.on('downloads:cleared', load);
load();
