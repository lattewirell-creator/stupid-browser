'use strict';
let settings = { name: '', searchUrl: 'https://www.google.com/search?q=%s' };
function tick() {
  const d = new Date(); const h = d.getHours();
  const part = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  $('greeting').textContent = settings.name ? `${part}, ${settings.name}` : part;
  $('clock').textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function tile(name, url, first) {
  const a = el('a', 'tile' + (first ? ' first' : '')); a.href = url; a.title = url;
  const ic = el('span', 'ic', (name || '?')[0].toUpperCase());
  const img = el('img'); img.src = favFor(url); img.onload = () => { ic.textContent = ''; ic.appendChild(img); };
  a.append(ic, el('span', 'nm', name));
  return a;
}
async function load() {
  try { settings = await call('settings:get'); } catch {}
  tick();
  const engine = settings.search === 'custom' ? 'the web' : ((settings.engines || {})[settings.search] || { name: 'Google' }).name;
  $('q').placeholder = `Search ${engine} or type a URL`;
  let bots = [];
  try { bots = await call('bots:get'); } catch {}
  $('tiles').innerHTML = '';
  bots.forEach((b, i) => $('tiles').appendChild(tile(b.name, b.url, i === 0)));
  let bms = [];
  try { bms = (await call('bookmarks:get')).filter((b) => b.type === 'bookmark').slice(0, 8); } catch {}
  $('top').innerHTML = '';
  $('topHead').classList.toggle('hidden', !bms.length);
  for (const b of bms) $('top').appendChild(tile(b.title || hostOf(b.url), b.url));
}
setInterval(tick, 10000);
load();
S.on('settings:changed', (s) => { settings = s; load(); });
S.on('bots:changed', load);
$('search').addEventListener('submit', (e) => {
  e.preventDefault();
  const t = $('q').value.trim(); if (!t) return;
  if (/^https?:\/\//i.test(t)) location.href = t;
  else if (!/\s/.test(t) && /^[^\s/]+\.[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(t)) location.href = 'https://' + t;
  else location.href = (settings.searchUrl || 'https://www.google.com/search?q=%s').replace('%s', encodeURIComponent(t));
});
