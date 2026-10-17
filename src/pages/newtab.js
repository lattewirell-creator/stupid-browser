'use strict';
let settings = { name: '', searchUrl: 'https://duckduckgo.com/?q=%s' };
function tick() {
  const d = new Date(); const h = d.getHours();
  const part = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  $('greeting').textContent = settings.name ? `${part}, ${settings.name}` : part;
  $('clock').textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: settings.clock24 === false ? 'h12' : settings.clock24 ? 'h23' : undefined });
}
function tile(name, url, used, onUse) {
  const a = el('a', 'tile' + (used ? ' used' : '')); a.href = url; a.title = url;
  if (onUse) a.addEventListener('click', (e) => { e.preventDefault(); onUse(); });
  const ic = el('span', 'ic', (name || '?')[0].toUpperCase());
  const img = el('img'); img.src = favFor(url); img.onload = () => { ic.textContent = ''; ic.appendChild(img); };
  a.append(ic, el('span', 'nm', name));
  return a;
}
async function load() {
  try { settings = await call('settings:get'); } catch {}
  tick();
  renderLogo();
}
async function loadBookmarks() {
  let bms = [];
  try { bms = (await call('bookmarks:get')).filter((b) => b.type === 'bookmark').slice(0, 8); } catch {}
  $('top').innerHTML = '';
  $('topHead').classList.toggle('hidden', !bms.length);
  for (const b of bms) $('top').appendChild(tile(b.title || hostOf(b.url), b.url));
}
setInterval(() => { if (!document.hidden) tick(); }, 10000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
load();
loadBookmarks();
S.on('settings:changed', (s) => { settings = s; tick(); renderLogo(); });
S.on('bookmarks:changed', loadBookmarks);

/* ---------------- logo, title, quotes, customize panel ---------------- */
const QUOTES = [
  'A browser is just a window that remembers where you’ve been.',
  'Forty tabs open is not chaos. It’s a plan.',
  'Every tab is a promise you made to your future self.',
  'The back button is the most honest button on the internet.',
  'Cookies: the only snack that follows you around.',
  'Close one tab today. You’ll feel lighter.',
  'The web is the world’s biggest library, and the browser is your library card.',
  'Somewhere, a tab you opened last year is still waiting for you.',
  'Refresh fixes more things than anyone wants to admit.',
  'A good browser gets out of the way.',
  'The address bar knows you better than most of your friends.',
  'Bookmarks are tabs that made it.',
  '“Loading…” is the internet’s way of saying “just a sec”.',
  'Every website was once someone’s first “Hello, world”.',
  'The first web browser was called WorldWideWeb. Naming was simpler then.',
  'The very first website is still online at info.cern.ch.',
  'Pinned tabs are tabs with a lease.',
  'There is no cloud. It’s someone else’s computer, loading your tab.',
  'Dark mode: because your eyes deserve a break too.',
  'Every 404 is a little adventure that ended early.',
  'History remembers. Private windows forget.',
  'Stupid browser, smart you.',
  'Tabs are like snacks: one more won’t hurt. (It will.)',
  'The best search result is the one you didn’t have to scroll for.',
  'Shields up. Ads down.',
  'Behind every “Accept all cookies” is a tiny surrender.',
  'The internet is forever. Your attention span isn’t.',
  'You don’t need another tab. You need a nap.',
  'A browser is a boat. The web is the ocean. Bring snacks.',
  'Hyperlinks: the original rabbit holes.'
];
const DEFAULT_TITLE = 'The Stupid Browser';
const EMOJI_PICKS = ['🦆', '🦊', '🐸', '🐙', '🌙', '🔥', '⭐', '🌈', '🍕', '🚀', '👾', '💜'];
let quoteIdx = -1;
let lastPool = '';
// Quotes come from the built-in list, your own lines (quotes or reminders), or both.
function quotePool() {
  const mine = Array.isArray(settings.myQuotes) ? settings.myQuotes : [];
  if (settings.quoteMode === 'mine' && mine.length) return mine;
  if (settings.quoteMode === 'mix') return [...QUOTES, ...mine];
  return QUOTES;
}
function nextQuote() {
  const pool = quotePool();
  let i; do { i = Math.floor(Math.random() * pool.length); } while (pool.length > 1 && pool[i] === $('quote').textContent);
  quoteIdx = i;
  const q = $('quote'); const hadText = !!q.textContent; q.classList.add('fade');
  setTimeout(() => { q.textContent = pool[i]; q.classList.remove('fade'); }, hadText ? 220 : 0);
}
function setLogo(node, kind) {
  node.className = 'logo ' + kind; node.textContent = ''; node.style.backgroundImage = '';
  if (kind === 'emoji') node.textContent = settings.logoEmoji || '🦆';
  if (kind === 'image') { if (settings.logoImage) node.style.backgroundImage = `url("${settings.logoImage}")`; else node.className = 'logo ring'; }
}
function renderLogo() {
  setLogo($('logo'), settings.logo || 'ring');
  $('wordmark').textContent = settings.wordmark || DEFAULT_TITLE;
  document.title = settings.wordmark ? `New tab · ${settings.wordmark}` : 'New tab';
  $('quote').classList.toggle('hidden', settings.showQuotes === false);
  const poolKey = (settings.quoteMode || 'browser') + '|' + (settings.myQuotes || []).length;
  if (settings.showQuotes !== false && (!$('quote').textContent || poolKey !== lastPool)) { lastPool = poolKey; nextQuote(); }
  if (!$('customize').classList.contains('hidden')) paintCustomize();
}
$('quote').addEventListener('click', nextQuote);
$('logo').addEventListener('click', () => openCustomize());

function paintCustomize() {
  const kind = settings.logo || 'ring';
  $('czLogos').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === kind));
  $('czEmojiPrev').textContent = settings.logoEmoji || '🦆';
  $('czImgPrev').style.backgroundImage = settings.logoImage ? `url("${settings.logoImage}")` : '';
  $('czEmojiRow').classList.toggle('hidden', kind !== 'emoji');
  $('czImageRow').classList.toggle('hidden', kind !== 'image');
  if (document.activeElement !== $('czEmoji')) $('czEmoji').value = settings.logoEmoji || '';
  if (document.activeElement !== $('czTitle')) $('czTitle').value = settings.wordmark || '';
  $('czQuotes').checked = settings.showQuotes !== false;
  $('czQuoteBox').classList.toggle('hidden', settings.showQuotes === false);
  const qm = settings.quoteMode || 'browser';
  $('czQuoteMode').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === qm));
  $('czMyQuotes').classList.toggle('hidden', qm === 'browser');
  if (document.activeElement !== $('czMyQuotes')) $('czMyQuotes').value = (settings.myQuotes || []).join('\n');
  const n = (settings.myQuotes || []).length;
  $('czQuoteNote').textContent = qm === 'browser' ? '' : n ? `${n} of your own · click the quote on the page to see another` : (qm === 'mine' ? 'Add at least one line — until then the browser quotes show.' : '');
}
function openCustomize() { $('customize').classList.remove('hidden'); paintCustomize(); }
const save = (patch) => call('settings:set', patch).then((s) => { settings = s; renderLogo(); }).catch(() => toast('Couldn’t save that'));
$('customizeBtn').addEventListener('click', () => { if ($('customize').classList.contains('hidden')) openCustomize(); else $('customize').classList.add('hidden'); });
$('czClose').addEventListener('click', () => $('customize').classList.add('hidden'));
$('czLogos').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.v === 'image' && !settings.logoImage) { $('czFile').click(); }
  save({ logo: b.dataset.v });
});
for (const em of EMOJI_PICKS) { const b = el('button', null, em); b.addEventListener('click', () => save({ logo: 'emoji', logoEmoji: em })); $('czPicks').appendChild(b); }
$('czEmoji').addEventListener('input', () => { const v = $('czEmoji').value.trim(); if (v) save({ logo: 'emoji', logoEmoji: v }); });
let titleT; $('czTitle').addEventListener('input', () => { clearTimeout(titleT); titleT = setTimeout(() => save({ wordmark: $('czTitle').value.trim() }), 250); });
$('czQuotes').addEventListener('change', () => save({ showQuotes: $('czQuotes').checked }));
$('czQuoteMode').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) save({ quoteMode: b.dataset.v }).then(() => { lastPool = ''; nextQuote(); }); });
let quotesT;
$('czMyQuotes').addEventListener('input', () => {
  clearTimeout(quotesT);
  quotesT = setTimeout(() => save({ myQuotes: $('czMyQuotes').value.split('\n').map((x) => x.trim()).filter(Boolean) }).then(() => { lastPool = ''; nextQuote(); }), 500);
});
$('czReset').addEventListener('click', () => save({ logo: 'ring', logoEmoji: '🦆', logoImage: '', wordmark: '', showQuotes: true }));
// Uploaded images are shrunk to 256px so settings stay small.
$('czFile').addEventListener('change', () => {
  const f = $('czFile').files[0]; $('czFile').value = '';
  if (!f || !/^image\//.test(f.type)) return;
  if (f.size > 15e6) { toast('That image is too big'); return; }
  const img = new Image(); const url = URL.createObjectURL(f);
  img.onload = () => {
    const n = 256, c = document.createElement('canvas'); c.width = c.height = n;
    const s = Math.min(img.width, img.height); const g = c.getContext('2d');
    g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, n, n);
    URL.revokeObjectURL(url);
    save({ logo: 'image', logoImage: c.toDataURL('image/png') });
  };
  img.onerror = () => { URL.revokeObjectURL(url); toast('Couldn’t read that image'); };
  img.src = url;
});
