'use strict';
/* New-tab background: none, a built-in gradient, or your own photo (stored via background:get/set).
   Uses newtab.js (settings, save) and common.js helpers. */
const BG_PRESETS = {
  dawn: { name: 'Dawn', light: true, css: 'linear-gradient(160deg, #FFD3A5, #FD6585)' },
  sand: { name: 'Sand', light: true, css: 'linear-gradient(160deg, #F7EBD3, #DDBB8E)' },
  sunset: { name: 'Sunset', light: false, css: 'linear-gradient(160deg, #FF7E5F, #C44569 55%, #4B2C5E)' },
  ocean: { name: 'Ocean', light: false, css: 'linear-gradient(160deg, #2193B0, #0F3460)' },
  forest: { name: 'Forest', light: false, css: 'linear-gradient(160deg, #134E5E, #71B280)' },
  grape: { name: 'Grape', light: false, css: 'linear-gradient(160deg, #41295A, #2F0743)' },
  aurora: { name: 'Aurora', light: false, css: 'radial-gradient(at 18% 22%, #43CEA2 0, transparent 45%), radial-gradient(at 82% 28%, #3A7BD5 0, transparent 45%), radial-gradient(at 50% 92%, #8E2DE2 0, transparent 55%), #0B1020' },
  midnight: { name: 'Midnight', light: false, css: 'radial-gradient(1px 1px at 20% 30%, #fff8, transparent), radial-gradient(1px 1px at 70% 20%, #fff9, transparent), radial-gradient(1.5px 1.5px at 40% 70%, #fff7, transparent), radial-gradient(1px 1px at 85% 60%, #fff8, transparent), linear-gradient(170deg, #0F2027, #203A43 60%, #2C5364)' }
};
let bgImage = null;   // loaded lazily (can be a few hundred KB)

async function renderBackground() {
  const kind = settings.bg || 'none';
  const layer = $('bg');
  let light = false, css = '';
  if (kind.startsWith('preset:') && BG_PRESETS[kind.slice(7)]) { const p = BG_PRESETS[kind.slice(7)]; css = p.css; light = p.light; }
  else if (kind === 'image') {
    if (bgImage === null) { try { bgImage = await call('background:get'); } catch { bgImage = ''; } }
    if (bgImage) css = `center / cover no-repeat url("${bgImage}")`;
  }
  layer.style.background = css;
  layer.style.setProperty('--dim', css && !light ? (settings.bgDim ?? 25) / 100 : 0);
  document.body.classList.toggle('has-bg', !!css);
  document.body.classList.toggle('bg-light', !!css && light);
  document.body.classList.toggle('bg-dark', !!css && !light);
  paintBgPicker();
}
function paintBgPicker() {
  const box = $('czBgs'); if (!box) return;
  const kind = settings.bg || 'none';
  box.replaceChildren();
  const tile = (id, label, style, extra) => {
    const b = el('button', 'cz-bg' + (kind === id ? ' on' : '')); b.title = label;
    const sw = el('span', 'cz-bg-sw'); if (style) sw.style.background = style; if (extra) sw.appendChild(extra);
    b.append(sw, el('small', null, label));
    return b;
  };
  const none = tile('none', 'None', '', null); none.addEventListener('click', () => save({ bg: 'none' })); box.appendChild(none);
  for (const [id, p] of Object.entries(BG_PRESETS)) {
    const b = tile('preset:' + id, p.name, p.css); b.addEventListener('click', () => save({ bg: 'preset:' + id })); box.appendChild(b);
  }
  const photo = tile('image', bgImage ? 'Your photo' : 'Upload…', bgImage ? `center / cover url("${bgImage}")` : '', bgImage ? null : el('b', null, '＋'));
  const file = el('input'); file.type = 'file'; file.accept = 'image/*'; file.hidden = true; photo.appendChild(file);
  photo.addEventListener('click', (e) => { if (e.target === file) return; if (kind === 'image' || !bgImage) file.click(); else save({ bg: 'image' }); });
  file.addEventListener('change', () => uploadBackground(file));
  box.appendChild(photo);
  $('czDimRow').classList.toggle('hidden', kind === 'none' || (kind.startsWith('preset:') && BG_PRESETS[kind.slice(7)] && BG_PRESETS[kind.slice(7)].light));
  $('czDim').value = settings.bgDim ?? 25; $('czDimVal').textContent = ($('czDim').value) + '%';
}
// Photos are scaled to fit 2560px and saved as JPEG so they stay a few hundred KB.
function uploadBackground(input) {
  const f = input.files[0]; input.value = '';
  if (!f || !/^image\//.test(f.type)) return;
  if (f.size > 40e6) { toast('That image is too big'); return; }
  const img = new Image(); const url = URL.createObjectURL(f);
  img.onload = async () => {
    const k = Math.min(1, 2560 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
    const data = c.toDataURL('image/jpeg', 0.85);
    if (!(await call('background:set', data))) { toast('Couldn’t save that image'); return; }
    bgImage = data; save({ bg: 'image' });
  };
  img.onerror = () => { URL.revokeObjectURL(url); toast('Couldn’t read that image'); };
  img.src = url;
}
let dimT;
$('czDim').addEventListener('input', () => {
  $('czDimVal').textContent = $('czDim').value + '%';
  $('bg').style.setProperty('--dim', $('czDim').value / 100);
  clearTimeout(dimT); dimT = setTimeout(() => save({ bgDim: +$('czDim').value }), 200);
});
S.on('background:changed', () => { bgImage = null; renderBackground(); });
S.on('settings:changed', () => setTimeout(renderBackground, 0));
$('customizeBtn').addEventListener('click', paintBgPicker);
call('settings:get').then((s) => { if (s) { settings = s; renderBackground(); } }).catch(() => {});
