'use strict';
/* Sound panel: equalizer for web audio. A headphones button appears in the toolbar when headphones
   are connected (or the EQ is on). The EQ itself runs inside pages (media-preload.js).
   Uses renderer.js globals (settings, call, $, el, svg, toast, showPopAt, hidePop). */
const EQ_BANDS = ['60', '150', '400', '1k', '2.4k', '6k', '10k', '15k'];
const EQ_PRESETS = {
  flat: { name: 'Flat', gains: [0, 0, 0, 0, 0, 0, 0, 0] },
  bass: { name: 'Bass boost', gains: [7, 5, 2, 0, 0, 0, 0, 0] },
  vocal: { name: 'Vocal', gains: [-2, -1, 1, 3, 4, 3, 1, 0] },
  treble: { name: 'Treble', gains: [0, 0, 0, 0, 1, 3, 5, 6] },
  rock: { name: 'Rock', gains: [4, 3, -1, -2, 1, 3, 4, 4] },
  electronic: { name: 'Electronic', gains: [6, 4, 0, -2, 1, 2, 3, 5] },
  podcast: { name: 'Podcast', gains: [-4, -2, 1, 3, 3, 2, 0, -2] },
  night: { name: 'Late night', gains: [-3, -1, 0, 1, 1, 0, -2, -4] }
};
const HEADPHONES = /head(phone|set)|airpods|ear(buds|phones|pods)|\bbuds\b|beats|bose|wh-1000|wf-1000|jabra|sennheiser|jbl tune|pixel buds|galaxy buds|bluetooth/i;
let outputLabel = '';
let headphonesOn = false;
let soundReady = false;

const eqState = () => Object.assign({ on: false, preset: 'flat', gains: EQ_PRESETS.flat.gains.slice() }, settings.eq || {});

async function checkOutput() {
  let devs = [];
  try { devs = await navigator.mediaDevices.enumerateDevices(); } catch { return; }
  const outs = devs.filter((d) => d.kind === 'audiooutput');
  const def = outs.find((d) => d.deviceId === 'default') || outs[0];
  const label = def ? def.label.replace(/^Default - /, '') : '';
  const isHp = !!label && HEADPHONES.test(label) && !/speaker/i.test(label);
  const was = headphonesOn;
  headphonesOn = isHp; outputLabel = label;
  renderSoundBtn();
  if (soundReady && isHp && !was) toast(`🎧 ${label} connected — tap the headphones button to tune the sound`);
  soundReady = true;
}
function renderSoundBtn() {
  const b = $('soundBtn'); if (!b) return;
  const eq = eqState();
  b.classList.toggle('hidden', !(headphonesOn || eq.on));
  b.classList.toggle('on', eq.on);
  b.title = (headphonesOn ? outputLabel + ' · ' : '') + 'Sound & EQ';
}

let eqSave;
function saveEq(eq) {
  settings.eq = eq; renderSoundBtn();
  clearTimeout(eqSave); eqSave = setTimeout(() => call('settings:set', { eq }), 120);
}
function openSoundPanel(anchor) {
  const pop = $('popover'); pop.innerHTML = ''; pop.className = 'pop sound-pop';
  const eq = eqState();
  const head = el('div', 'snd-head');
  const ic = el('span', 'snd-ic'); ic.appendChild(svg('<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3.5" y="14" width="4" height="6.5" rx="1.6"/><rect x="16.5" y="14" width="4" height="6.5" rx="1.6"/>'));
  const tt = el('div', 'grow'); tt.appendChild(el('div', 'pop-title serif', 'Sound'));
  tt.appendChild(el('div', 'pop-note', headphonesOn ? outputLabel : (outputLabel ? `Playing on ${outputLabel}` : 'Equalizer for music and videos')));
  const tog = el('input', 'toggle'); tog.type = 'checkbox'; tog.checked = eq.on; tog.title = 'Equalizer on/off';
  head.append(ic, tt, tog);
  pop.appendChild(head);

  const presets = el('div', 'snd-presets');
  for (const [k, p] of Object.entries(EQ_PRESETS)) {
    const b = el('button', 'pill small' + (eq.preset === k ? ' active' : ''), p.name);
    b.addEventListener('click', () => { Object.assign(eq, { preset: k, gains: p.gains.slice(), on: k === 'flat' ? eq.on : true }); saveEq(eq); paint(); });
    presets.appendChild(b);
  }
  pop.appendChild(presets);

  const sliders = el('div', 'snd-sliders');
  const inputs = EQ_BANDS.map((band, i) => {
    const col = el('label', 'snd-band');
    const val = el('span', 'snd-val');
    const r = el('input'); r.type = 'range'; r.min = -12; r.max = 12; r.step = 0.5; r.value = eq.gains[i];
    r.addEventListener('input', () => { eq.gains[i] = +r.value; eq.preset = 'custom'; eq.on = true; saveEq(eq); paint(); });
    r.addEventListener('dblclick', () => { eq.gains[i] = 0; saveEq(eq); paint(); });
    col.append(val, r, el('span', 'snd-hz', band));
    sliders.appendChild(col);
    return { r, val };
  });
  pop.appendChild(sliders);
  const foot = el('div', 'pop-actions');
  foot.appendChild(el('span', 'pop-note', 'Works on most sites. Spotify and other copy-protected players can’t be equalized.'));
  pop.appendChild(foot);
  tog.addEventListener('change', () => { eq.on = tog.checked; saveEq(eq); paint(); });

  function paint() {
    tog.checked = eq.on;
    pop.classList.toggle('off', !eq.on);
    presets.querySelectorAll('.pill').forEach((b, j) => b.classList.toggle('active', Object.keys(EQ_PRESETS)[j] === eq.preset));
    inputs.forEach(({ r, val }, i) => { r.value = eq.gains[i]; val.textContent = (eq.gains[i] > 0 ? '+' : '') + eq.gains[i]; r.style.setProperty('--fillp', ((eq.gains[i] + 12) / 24 * 100) + '%'); });
  }
  paint();
  const btn = anchor || ($('soundBtn').classList.contains('hidden') ? $('menuBtn') : $('soundBtn'));
  const rr = btn.getBoundingClientRect();
  showPopAt(pop, rr.right - pop.getBoundingClientRect().width, rr.bottom + 6);
}
$('soundBtn').addEventListener('click', () => {
  const p = $('popover');
  if (!p.classList.contains('hidden') && p.classList.contains('sound-pop')) hidePop(); else openSoundPanel();
});
navigator.mediaDevices.addEventListener('devicechange', checkOutput);
api.on('settings:changed', () => setTimeout(renderSoundBtn, 0));
checkOutput();
