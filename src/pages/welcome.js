'use strict';
/* First-run welcome (stupid://welcome/). Shown once after a fresh install; every step has a Skip button.
   Saves as you go, then marks the browser as onboarded and opens a new tab. */
const steps = [...document.querySelectorAll('.step')];
let i = 0;
let s = {};
const LOGO_PICKS = [['ring', ''], ['buddy', ''], ['emoji', '🦆'], ['emoji', '🦊'], ['emoji', '🐸'], ['emoji', '🌙'], ['emoji', '🚀'], ['emoji', '👾']];
const QUICK_AI = [
  { id: 'anthropic', name: 'Claude', sub: 'by Anthropic', key: true },
  { id: 'openai', name: 'ChatGPT', sub: 'by OpenAI', key: true },
  { id: 'gemini', name: 'Gemini', sub: 'by Google', key: true },
  { id: 'ollama', name: 'Ollama', sub: 'free, on this computer', key: false },
  { id: 'off', name: 'No thanks', sub: 'turn Buddy off', key: false }
];
const set = (patch) => call('settings:set', patch).then((n) => { s = n; return n; });

// Every step has its own Skip; Next keeps what you chose on the step.
function nextLabel() { return i === steps.length - 1 ? 'Start browsing' : 'Next'; }
function show(n) {
  i = Math.max(0, Math.min(steps.length - 1, n));
  steps.forEach((st, k) => { st.classList.toggle('on', k === i); st.classList.toggle('past', k < i); });
  $('dots').replaceChildren(...steps.map((_, k) => el('i', k === i ? 'on' : k < i ? 'done' : '')));
  $('back').classList.toggle('hidden', i === 0);
  $('next').textContent = nextLabel();
  $('skipAll').classList.toggle('hidden', i === steps.length - 1);
  $('skip').classList.toggle('hidden', i === steps.length - 1);
  if (steps[i].dataset.step === 'hello') setTimeout(() => $('name').focus(), 350);
  if (steps[i].dataset.step === 'done') $('doneTitle').textContent = s.name ? `You’re all set, ${s.name}` : 'You’re all set';
}
async function finish() {
  await set({ onboarded: true });
  location.href = 'stupid://newtab/';
}
$('next').addEventListener('click', async () => {
  if (steps[i].dataset.step === 'hello') await set({ name: $('name').value.trim() });
  if (i === steps.length - 1) return finish();
  show(i + 1);
});
$('back').addEventListener('click', () => show(i - 1));
$('skip').addEventListener('click', () => show(i + 1));
$('skipAll').addEventListener('click', finish);
$('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('next').click(); });

/* ---------- look ---------- */
function paintLook() {
  document.querySelectorAll('#theme button').forEach((b) => b.classList.toggle('on', b.dataset.v === (s.theme || 'system')));
  $('accent').replaceChildren(...Object.entries(ACCENTS).map(([k, c]) => {
    const b = el('button', 'swatch' + ((s.accent || 'clay') === k ? ' on' : '')); b.style.background = c; b.title = k;
    b.addEventListener('click', () => set({ accent: k }).then(paintLook)); return b;
  }));
  $('logos').replaceChildren(...LOGO_PICKS.map(([kind, em]) => {
    const on = (s.logo || 'ring') === kind && (kind !== 'emoji' || s.logoEmoji === em);
    const b = el('button', 'logo-pick' + (on ? ' on' : '')); b.title = kind === 'ring' ? 'Classic' : kind === 'buddy' ? 'Buddy' : em;
    if (kind === 'ring' || kind === 'buddy') b.appendChild(el('span', kind)); else b.textContent = em;
    b.addEventListener('click', () => set(kind === 'emoji' ? { logo: 'emoji', logoEmoji: em } : { logo: kind }).then(paintLook)); return b;
  }));
  const pv = $('pvLogo'); pv.className = 'pv-logo' + ((s.logo || 'ring') === 'emoji' ? ' emoji' : s.logo === 'buddy' ? ' buddy' : ''); pv.textContent = s.logo === 'emoji' ? (s.logoEmoji || '🦆') : '';
  const h = new Date().getHours();
  $('pvGreet').textContent = (h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening') + (s.name ? `, ${s.name}` : '');
  $('preview').dataset.theme = s.theme || 'system';
}
document.querySelectorAll('#theme button').forEach((b) => b.addEventListener('click', () => set({ theme: b.dataset.v }).then(paintLook)));

/* ---------- default browser ---------- */
async function paintDefault() {
  let st = {}; try { st = await call('default:status'); } catch {}
  const isDef = st.http && st.https;
  $('makeDefault').textContent = isDef ? '✓ It’s your default browser' : 'Make it my default browser';
  $('makeDefault').disabled = !!isDef;
  $('defaultNote').textContent = isDef ? '' : (window.stupid.platform === 'android' ? 'Android will ask you to pick your browser app.' : st.platform === 'darwin' ? 'macOS will ask you to confirm.' : 'Windows opens Default apps — pick “The Stupid Browser” for HTTP and HTTPS.');
}
$('makeDefault').addEventListener('click', async () => { await call('default:set'); setTimeout(paintDefault, 1500); setTimeout(paintDefault, 5000); });

/* ---------- import bookmarks ---------- */
// The browser with the most bookmarks gets the big one-click card; the others are small buttons below it.
const imported = new Set();
const IMP_COLORS = { chrome: '#4285F4', edge: '#0F7BC4', brave: '#E2582C', arc: '#E3435D', vivaldi: '#D93B3B', opera: '#D32635', operagx: '#C2185B', chromium: '#5B87B5', firefox: '#E66000', zen: '#6F6A63', librewolf: '#3A6FB0', safari: '#1C8FE6' };
const srcTitle = (src) => src.name + (src.profile ? ` · ${src.profile}` : '');
const plural = (n, one, many) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
async function importFrom(src) {
  if (imported.has(src.id)) return;
  const r = await call('import:browser', src.id);
  if (!r.ok) { $('importNote').textContent = r.error; return; }
  imported.add(src.id);
  $('importNote').textContent = `✓ Added ${plural(r.added, 'bookmark', 'bookmarks')}${r.history ? ` and ${plural(r.history, 'history entry', 'history entries')}` : ''} from ${src.name}.`;
  paintImport();
}
let importList = null;
async function paintImport() {
  if (!importList) { importList = []; try { importList = await call('import:sources'); } catch {} }
  const usable = importList.filter((x) => !x.needsAccess);
  const ranked = usable.slice().sort((a, b) => (b.count + (b.history ? 50 : 0)) - (a.count + (a.history ? 50 : 0)));
  const main = ranked[0], safari = importList.find((x) => x.needsAccess);
  const box = $('impMain');
  if (main) {
    const done = imported.has(main.id);
    const card = el('div', 'imp-card' + (done ? ' done' : ''));
    const badge = el('span', 'imp-badge', main.name.replace(/^(Google|Microsoft) /, '')[0]); badge.style.background = IMP_COLORS[main.browser] || 'var(--accent)';
    const what = el('div', 'what'); what.append(el('b', null, srcTitle(main)), el('small', null, [main.account, `${plural(main.count, 'bookmark', 'bookmarks')}${main.history ? ' and your history' : ''}`].filter(Boolean).join(' · ')));
    const go = el('button', 'btn' + (done ? '' : ' primary'), done ? '✓ Imported' : 'Import'); go.disabled = done;
    go.addEventListener('click', async () => { go.disabled = true; go.textContent = 'Importing…'; await importFrom(main); });
    card.append(badge, what, go); box.replaceChildren(card);
  } else if (safari) {
    const card = el('div', 'imp-card');
    const badge = el('span', 'imp-badge', 'S'); badge.style.background = IMP_COLORS.safari;
    const what = el('div', 'what'); what.append(el('b', null, 'Safari'), el('small', null, 'macOS needs your OK first: turn on The Stupid Browser under Full Disk Access, then restart it.'));
    const go = el('button', 'btn primary', 'Allow access…'); go.addEventListener('click', () => call('import:safariAccess'));
    card.append(badge, what, go); box.replaceChildren(card);
  } else {
    box.replaceChildren();
    if (!$('importNote').textContent) $('importNote').textContent = 'No other browsers found on this computer. You can still import a bookmarks file.';
  }
  const rest = ranked.slice(1);
  $('impOthers').classList.toggle('hidden', !rest.length);
  $('sources').replaceChildren(...rest.map((src) => {
    const b = el('button', 'prov src' + (imported.has(src.id) ? ' on' : ''));
    b.append(el('b', null, srcTitle(src)), el('small', null, imported.has(src.id) ? '✓ Imported' : (src.account || plural(src.count, 'bookmark', 'bookmarks'))));
    b.addEventListener('click', () => importFrom(src));
    return b;
  }));
}
$('importPw').addEventListener('click', async () => {
  const r = await call('import:passwords');
  if (r.ok) { imported.add('pw'); $('importNote').textContent = `✓ Imported ${r.added} passwords. Now delete ${r.file}: it holds your passwords in plain text.`; }
  else if (r.error !== 'canceled') $('importNote').textContent = r.error;
});
$('importFile').addEventListener('click', async () => {
  const r = await call('import:file');
  if (r.ok) $('importNote').textContent = `✓ Added ${r.added} bookmarks from the file.`;
  else if (r.error !== 'canceled') $('importNote').textContent = r.error;
});

/* ---------- AI buddy ---------- */
let chosen = null;
async function paintBuddy() {
  let st = {}; try { st = await call('buddy:status'); } catch {}
  const current = st.enabled === false ? 'off' : st.provider;
  $('providers').replaceChildren(...QUICK_AI.map((p) => {
    const b = el('button', 'prov' + ((chosen || current) === p.id ? ' on' : ''));
    b.append(el('b', null, p.name), el('small', null, p.sub));
    b.addEventListener('click', () => pickAI(p)); return b;
  }));
  const p = QUICK_AI.find((x) => x.id === (chosen || current));
  const info = st.providers && p && st.providers[p.id];
  $('keyRow').classList.toggle('hidden', !(p && p.key));
  $('key').placeholder = info && info.hasKey ? '•••••• saved — paste a new key to replace' : `Paste your ${p ? p.name : ''} API key`;
  $('buddyNote').textContent = !p ? '' : p.id === 'off' ? 'Buddy is off. You can turn it on any time in Settings → AI buddy.'
    : p.id === 'ollama' ? 'Install Ollama from ollama.com, then pick a model in Settings → AI buddy.'
    : info && info.hasKey ? `✓ Key saved. Buddy will use ${p.name}.` : `Get a key at ${info ? info.keyUrl : 'the provider’s website'}. It’s stored encrypted on this computer.`;
}
async function pickAI(p) {
  chosen = p.id;
  const b = Object.assign({}, s.buddy);
  if (p.id === 'off') { await set({ buddy: Object.assign(b, { enabled: false }), aiButton: 'sidebar' }); }
  else { await set({ buddy: Object.assign(b, { enabled: true, provider: p.id }), aiButton: 'buddy' }); }
  paintBuddy();
  if (p.key) setTimeout(() => $('key').focus(), 50);
}
$('saveKey').addEventListener('click', async () => {
  const r = await call('buddy:setKey', chosen || (s.buddy && s.buddy.provider) || 'anthropic', $('key').value);
  if (!r.ok) { toast(r.error); return; }
  $('key').value = ''; toast('Key saved'); paintBuddy();
});
$('key').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('saveKey').click(); });

(async () => {
  try { s = await call('settings:get'); } catch {}
  if (s.name) $('name').value = s.name;
  paintLook(); paintImport(); paintDefault(); paintBuddy(); show(0);
})();
