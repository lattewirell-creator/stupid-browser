'use strict';
/* AI buddy: a little helper in the bottom-right corner. The AI button (and Ctrl+Shift+A) opens it when
   Settings → AI button is set to "AI buddy" (the default); otherwise it opens the AI sidebar as before.
   It can look at the current tab (screenshot + page text). Requests run in main (buddy-main.js).
   Uses renderer.js globals (settings, api, call, $, el, svg, activeTab, openUrlInternal, toggleAI). */
(() => {
  const root = el('div', 'buddy hidden'); root.id = 'buddy';
  const panel = el('section', 'bd-panel');
  const head = el('div', 'bd-head');
  // 3D robot buddy: head turns and eyes follow the mouse (see .bot3d in styles.css).
  const bot = (size) => {
    const b = el('span', 'bot3d ' + size);
    const fl = el('span', 'bot-float');
    const ant = el('span', 'bot-antenna'); ant.appendChild(el('i'));
    const headEl = el('span', 'bot-head');
    const visor = el('span', 'bot-visor');
    const eyes = el('span', 'bot-eyes'); eyes.append(el('i', 'bot-eye'), el('i', 'bot-eye'));
    visor.append(eyes, el('span', 'bot-mouth'));
    headEl.append(el('span', 'bot-ear l'), el('span', 'bot-ear r'), visor, el('span', 'bot-photo'), el('span', 'bot-shine'), el('span', 'bot-extra'));
    fl.append(ant, headEl);
    b.append(el('span', 'bot-shadow'), fl);
    return b;
  };
  const face = () => bot('mini');
  const titleBox = el('div', 'bd-titles'); const modelLine = el('small', null, '');
  const nameEl = el('b', null, 'Buddy');
  titleBox.append(nameEl, modelLine);
  const editBtn = el('button', 'icon-btn small'); editBtn.title = 'Customize name & look'; editBtn.appendChild(svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>'));
  const newBtn = el('button', 'icon-btn small'); newBtn.title = 'New chat'; newBtn.appendChild(svg('<path d="M12 5v14M5 12h14"/>'));
  const closeBtn = el('button', 'icon-btn small'); closeBtn.title = 'Hide Buddy'; closeBtn.appendChild(svg('<path d="M6 6l12 12M18 6L6 18"/>'));
  head.append(face(), titleBox, el('div', 'grow'), editBtn, newBtn, closeBtn);
  const log = el('div', 'bd-log');
  const chips = el('div', 'bd-chips');
  const form = el('form', 'bd-form');
  const lookBtn = el('button', 'bd-look on'); lookBtn.type = 'button'; lookBtn.title = 'Let Buddy see the current tab';
  lookBtn.append(svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'));
  const input = el('textarea', 'bd-input'); input.rows = 1; input.placeholder = 'Ask about this page…'; input.maxLength = 4000;
  const sendBtn = el('button', 'bd-send'); sendBtn.type = 'submit'; sendBtn.title = 'Send';
  const sendIcon = svg('<path d="M5 12h13M13 6l6 6-6 6"/>'); const stopIcon = svg('<rect x="7" y="7" width="10" height="10" rx="2" class="fill"/>');
  sendBtn.appendChild(sendIcon);
  form.append(lookBtn, input, sendBtn);
  const custom = el('div', 'bd-custom hidden');
  panel.append(head, log, custom, chips, form);
  const avatar = el('button', 'bd-avatar'); avatar.title = 'Buddy'; avatar.appendChild(bot('big'));
  root.append(panel, avatar);
  document.getElementById('content').appendChild(root);

  let status = { hasKey: false };
  // Real 3D buddy (buddy3d.js, an ES module that loads after this script); the CSS robot stays as fallback.
  let b3 = null;
  function mount3d() {
    if (b3 || !window.Buddy3D) return;
    b3 = window.Buddy3D.create(avatar, { interactive: true });
    if (!b3) return;
    root.classList.add('b3d');
    b3.setLook(look3d()); b3.setState({ sleepy: !status.ready }); b3.setVisible(!root.classList.contains('hidden'));
  }
  if (window.Buddy3D) setTimeout(mount3d, 0); else addEventListener('buddy3d-ready', mount3d, { once: true });
  let busy = false;
  let look = true;
  let current = null;   // bubble being streamed into

  /* ---------- tiny safe formatter: **bold**, `code`, - lists; no HTML from the model ---------- */
  function fmt(node, text) {
    node.replaceChildren();
    for (const line of text.split('\n')) {
      const bullet = /^\s*[-*•]\s+/.test(line);
      const row = el('div', bullet ? 'bd-li' : 'bd-p');
      const body = bullet ? line.replace(/^\s*[-*•]\s+/, '') : line.replace(/^#+\s+/, '');
      for (const part of body.split(/(\*\*[^*]+\*\*|`[^`]+`)/)) {
        if (!part) continue;
        if (/^\*\*[^*]+\*\*$/.test(part)) row.appendChild(el('b', null, part.slice(2, -2)));
        else if (/^`[^`]+`$/.test(part)) row.appendChild(el('code', null, part.slice(1, -1)));
        else row.appendChild(document.createTextNode(part));
      }
      if (!body.trim() && !bullet) row.classList.add('gap');
      node.appendChild(row);
    }
  }
  function bubble(who, text) {
    const b = el('div', 'bd-msg ' + who);
    if (who === 'bot') fmt(b, text); else b.textContent = text;
    log.appendChild(b); log.scrollTop = log.scrollHeight;
    return b;
  }
  function note(text, action) {
    const n = el('div', 'bd-note'); n.appendChild(el('span', null, text));
    if (action) { const a = el('button', 'pill small', action.label); a.addEventListener('click', action.fn); n.appendChild(a); }
    log.appendChild(n); log.scrollTop = log.scrollHeight;
  }
  function renderChips() {
    chips.replaceChildren();
    if (!status.ready || log.querySelector('.bd-msg')) return;
    for (const q of ['What’s on my screen?', 'Summarize this page', 'Explain it like I’m 10', 'Is this site legit?']) {
      const c = el('button', 'bd-chip', q); c.addEventListener('click', () => ask(q, true)); chips.appendChild(c);
    }
  }
  function greet() {
    log.replaceChildren();
    if (!status.ready) {
      bubble('bot', `Hi! I’m **${buddyName()}**. I can look at the page you’re on and answer questions about it.\n\nTo wake me up, pick an AI (Claude, ChatGPT, Gemini, Grok, a free local one with Ollama…) in Settings.`);
      note('Settings → AI buddy', { label: 'Open settings', fn: () => openUrlInternal('settings', '#buddy') });
    } else bubble('bot', 'Hi! Ask me anything — I can see the tab you’re on when the 👁 is lit.');
    renderChips();
  }
  async function refreshStatus() {
    try { status = await call('buddy:status'); } catch { status = { ready: false }; }
    modelLine.textContent = status.ready ? `${status.providerName.replace(/ \(.*\)/, '')} · ${status.modelName}` : 'Not set up';
    modelLine.title = modelLine.textContent;
    root.classList.toggle('nokey', !status.ready);
    if (b3) b3.setState({ sleepy: !status.ready });
  }

  const ERRORS = {
    nokey: 'Add your API key in Settings → AI buddy first.', badkey: 'That API key didn’t work. Check it in Settings → AI buddy.',
    ratelimit: 'Too many requests right now. Try again in a moment.', offline: 'I can’t reach the internet right now.',
    refusal: 'I can’t help with that one.', stopped: '', busy: '', empty: '',
    nomodel: 'Pick a model in Settings → AI buddy first.', disabled: 'Buddy is turned off in Settings.',
    ollama: 'Ollama isn’t running on this computer — start the Ollama app and try again.'
  };
  async function ask(text, forceLook) {
    text = String(text || input.value).trim();
    if (!text || busy) return;
    if (!status.ready) await refreshStatus();   // a key may have been added since Buddy last looked
    if (!status.ready) { greet(); return; }
    input.value = ''; autoGrow(); chips.replaceChildren();
    bubble('me', text);
    const t = activeTab();
    const useLook = (forceLook || look) && t && t.wv && t.ready && /^https?:/.test(t.url);
    if (useLook) note('👁 Looking at “' + (t.title || t.url).slice(0, 60) + '”');
    current = bubble('bot', ''); current.classList.add('typing'); current.__text = '';
    setBusy(true);
    let res;
    const box = useLook ? t.wv.getBoundingClientRect() : null;
    try { res = await call('buddy:ask', { text, look: useLook, tabWcId: useLook ? t.wv.getWebContentsId() : null, rect: box ? { x: box.left, y: box.top, width: box.width, height: box.height } : null }); }
    catch { res = { ok: false, error: 'api' }; }
    setBusy(false);
    current.classList.remove('typing');
    if (!res.ok) {
      if (!current.__text) current.remove();
      const msg = res.error === 'model' ? `This AI doesn’t offer the model “${res.detail}”. Pick another in Settings.` : res.error in ERRORS ? ERRORS[res.error] : `Something went wrong${res.detail ? ': ' + res.detail : ''}.`;
      if (msg) note(msg, ['badkey', 'nokey', 'nomodel', 'model'].includes(res.error) ? { label: 'Open settings', fn: () => openUrlInternal('settings', '#buddy') } : null);
    } else {
      if (res.note === 'textonly') note('(This model can’t see images, so I read the page text instead.)');
      if (res.truncated) note('(That answer was cut short.)');
    }
    current = null;
  }
  api.on('buddy:delta', (d) => {
    if (!current) return;
    current.classList.remove('typing');
    current.__text += d; fmt(current, current.__text); log.scrollTop = log.scrollHeight;
    root.classList.add('talking'); clearTimeout(talkT); talkT = setTimeout(() => { root.classList.remove('talking'); if (b3) b3.setState({ talking: false }); }, 400);
    if (b3) b3.setState({ talking: true });
  });
  let talkT, happyT;
  // Head and eyes follow the mouse while it's over the browser UI; otherwise Buddy glances around on its own.
  let raf = 0, idleT;
  addEventListener('mousemove', (e) => {
    if (raf || root.classList.contains('hidden')) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const r = avatar.getBoundingClientRect(); if (!r.width) return;
      const dx = (e.clientX - (r.left + r.width / 2)) / innerWidth, dy = (e.clientY - (r.top + r.height / 2)) / innerHeight;
      if (b3) b3.lookAt(dx * 2.2, -dy * 2.2);
      root.style.setProperty('--ry', (Math.max(-1, Math.min(1, dx * 2.2)) * 28).toFixed(1) + 'deg');
      root.style.setProperty('--rx', (Math.max(-1, Math.min(1, -dy * 2.2)) * 18).toFixed(1) + 'deg');
      root.style.setProperty('--ex', (Math.max(-1, Math.min(1, dx * 3)) * 3).toFixed(1) + 'px');
      root.style.setProperty('--ey', (Math.max(-1, Math.min(1, dy * 3)) * 2).toFixed(1) + 'px');
      root.classList.add('tracking'); clearTimeout(idleT); idleT = setTimeout(() => root.classList.remove('tracking'), 2500);
    });
  });
  function setBusy(b) {
    busy = b; root.classList.toggle('busy', b);
    if (b3) b3.setState({ busy: b, happy: !b });
    if (!b) { root.classList.add('happy'); clearTimeout(happyT); happyT = setTimeout(() => root.classList.remove('happy'), 1800); }
    sendBtn.replaceChildren(b ? stopIcon : sendIcon); sendBtn.title = b ? 'Stop' : 'Send';
  }
  const autoGrow = () => { input.style.height = 'auto'; input.style.height = Math.min(120, input.scrollHeight) + 'px'; };
  input.addEventListener('input', autoGrow);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } if (e.key === 'Escape') hideBuddy(); });
  form.addEventListener('submit', (e) => { e.preventDefault(); if (busy) call('buddy:stop'); else ask(); });
  lookBtn.addEventListener('click', () => { look = !look; lookBtn.classList.toggle('on', look); lookBtn.title = look ? 'Buddy can see the current tab' : 'Buddy can’t see the tab'; call('settings:set', { buddy: Object.assign({}, settings.buddy, { look }) }); });
  newBtn.addEventListener('click', () => { call('buddy:reset'); greet(); });
  closeBtn.addEventListener('click', () => hideBuddy());
  avatar.addEventListener('click', () => { if (b3 && b3.canvas.dataset.dragged) return; root.classList.toggle('open'); });

  async function showBuddy() {
    await refreshStatus();
    look = !(settings.buddy && settings.buddy.look === false); lookBtn.classList.toggle('on', look);
    const wasHidden = root.classList.contains('hidden');
    root.classList.remove('hidden'); root.classList.add('open');
    $('aiBtn').classList.add('on');
    mount3d(); if (b3) b3.setVisible(true);
    if (wasHidden && !log.querySelector('.bd-msg.me')) greet();
    setTimeout(() => input.focus(), 50);
  }
  function hideBuddy() { root.classList.add('hidden'); root.classList.remove('open'); $('aiBtn').classList.remove('on'); if (b3) b3.setVisible(false); }
  window.toggleBuddy = () => (root.classList.contains('hidden') ? showBuddy() : hideBuddy());
  // The AI button does what Settings → AI button says (buddy by default); "off" hides the button.
  const buddyOn = () => !(settings.buddy && settings.buddy.enabled === false);
  window.aiButtonAction = () => {
    if (settings.aiButton === 'off') return;
    if (settings.aiButton === 'sidebar' || !buddyOn()) toggleAI(); else window.toggleBuddy();
  };
  function applyAiPrefs() {
    $('aiBtn').classList.toggle('hidden', settings.aiButton === 'off');
    $('aiBtn').title = keyLabel(settings.aiButton === 'sidebar' || !buddyOn() ? 'AI sidebar (Ctrl+Shift+A)' : 'AI buddy (Ctrl+Shift+A)');
    if (!buddyOn() && !root.classList.contains('hidden')) hideBuddy();
  }
  api.on('settings:changed', () => setTimeout(() => {
    applyAiPrefs();
    if (!root.classList.contains('hidden')) refreshStatus().then(() => { if (!log.querySelector('.bd-msg.me')) greet(); });
  }, 0));
  call('settings:get').then((s) => { if (s) { settings = Object.assign({}, settings, s); applyAiPrefs(); } }).catch(() => {});
  /* ---------- name & look (Settings key buddyLook: { name, color, glow, extra, image }) ---------- */
  const BODY = { clay: '#D97757', sky: '#4F8DE0', mint: '#3FB98A', grape: '#8A5CD6', rose: '#E0607E', sun: '#E9A23B', night: '#3B3F58', snow: '#D9DCE3' };
  const GLOW = { cyan: '#7CF5FF', green: '#7CFF9E', pink: '#FF8AD8', amber: '#FFC86B', white: '#FFFFFF', violet: '#B79CFF' };
  const EXTRAS = { none: 'None', headphones: '🎧', cap: '🧢', bow: '🎀', crown: '👑', glasses: '🕶️', flower: '🌼' };
  const SHAPES = { hiker: ['🎒', 'Hiker'], round: ['⚪', 'Robot'], cube: ['◻️', 'Cube'], capsule: ['💊', 'Capsule'], egg: ['🥚', 'Egg'], tv: ['📺', 'TV'] };
  const HATS = { none: ['✖', 'None'], tophat: ['🎩', 'Top hat'], cap: ['🧢', 'Cap'], beanie: ['🧶', 'Beanie'], crown: ['👑', 'Crown'], party: ['🥳', 'Party'], cowboy: ['🤠', 'Cowboy'], headphones: ['🎧', 'Headphones'], halo: ['😇', 'Halo'] };
  const EYES = { dot: ['•', 'Dots'], round: ['👀', 'Round'], sleepy: ['😌', 'Sleepy'], wide: ['😳', 'Wide'], lash: ['😉', 'Lashes'] };
  const MOUTHS = { smile: ['🙂', 'Smile'], grin: ['😁', 'Grin'], flat: ['😐', 'Flat'], open: ['😮', 'Open'], cat: ['😺', 'Cat'] };
  const GLASSES = { none: ['✖', 'None'], round: ['👓', 'Round'], square: ['🤓', 'Square'], shades: ['🕶️', 'Shades'], star: ['⭐', 'Stars'], heart: ['💖', 'Hearts'] };
  // Older looks only had one "extra"; map it onto hat/glasses.
  const look3d = () => {
    const L = lookCfg();
    const fromExtra = { headphones: ['headphones', null], cap: ['cap', null], crown: ['crown', null], glasses: [null, 'shades'] }[L.extra] || [null, null];
    return { eyes: EYES[L.eyes] ? L.eyes : 'dot', mouth: MOUTHS[L.mouth] ? L.mouth : 'smile', outfit: L.outfit || 'sky', backpack: L.backpack !== false, scarf: L.scarf !== false,
      shape: SHAPES[L.shape] ? L.shape : 'hiker', hat: HATS[L.hat] ? L.hat : (fromExtra[0] || 'none'), glasses: GLASSES[L.glasses] ? L.glasses : (fromExtra[1] || 'none'), color: L.color, glow: L.glow, image: L.image };
  };
  let previewBox = null, previewB3 = null;
  const lookCfg = () => Object.assign({ name: 'Buddy', color: 'clay', glow: 'cyan', extra: 'none', image: '' }, settings.buddyLook || {});
  function buddyName() { return (lookCfg().name || 'Buddy').trim() || 'Buddy'; }
  function applyLook() {
    const L = lookCfg();
    root.style.setProperty('--bc', BODY[L.color] || (/^#[0-9a-f]{6}$/i.test(L.color) ? L.color : BODY.clay));
    root.style.setProperty('--glow', GLOW[L.glow] || (/^#[0-9a-f]{6}$/i.test(L.glow) ? L.glow : GLOW.cyan));
    root.dataset.extra = EXTRAS[L.extra] ? L.extra : 'none';
    const img = /^data:image\/(png|jpeg|webp);base64,/.test(L.image) ? L.image : '';
    root.classList.toggle('photo', !!img);
    root.querySelectorAll('.bot-photo').forEach((p) => { p.style.backgroundImage = img ? `url("${img}")` : ''; });
    root.querySelectorAll('.bot-extra').forEach((x) => { x.textContent = L.extra !== 'none' && EXTRAS[L.extra] ? EXTRAS[L.extra] : ''; });
    nameEl.textContent = buddyName(); avatar.title = buddyName();
    if (b3) b3.setLook(look3d());
    input.placeholder = `Ask ${buddyName()} about this page…`;
  }
  let lookT;
  const saveLook = (patch) => { settings.buddyLook = Object.assign(lookCfg(), patch); applyLook(); paintCustom(); clearTimeout(lookT); lookT = setTimeout(() => call('settings:set', { buddyLook: settings.buddyLook }), 250); };
  function paintCustom() {
    if (custom.classList.contains('hidden')) return;
    const L = lookCfg();
    custom.replaceChildren();
    // 3D preview you can spin and poke (made once per customize session).
    if (!previewBox) { previewBox = el('div', 'bdc-preview'); if (window.Buddy3D) { previewB3 = window.Buddy3D.create(previewBox, { interactive: true }); } if (!previewB3) previewBox.appendChild(bot('big')); }
    if (previewB3) previewB3.setLook(look3d());
    custom.appendChild(previewBox);
    if (previewB3) custom.appendChild(el('div', 'bdc-hint', 'Drag to spin · click to poke'));
    const nm = el('input', 'bd-input bdc-name'); nm.maxLength = 20; nm.value = L.name; nm.placeholder = 'Name';
    nm.addEventListener('input', () => saveLook({ name: nm.value }));
    const row = (label, node) => { const r = el('div', 'bdc-row'); r.append(el('span', 'bdc-label', label), node); custom.appendChild(r); };
    row('Name', nm);
    const sw = (map, cur, key) => {
      const box = el('div', 'bdc-swatches');
      for (const [k, c] of Object.entries(map)) { const b = el('button', 'bdc-sw' + (cur === k ? ' on' : '')); b.style.background = c; b.title = k; b.addEventListener('click', () => saveLook({ [key]: k })); box.appendChild(b); }
      const pick = el('input'); pick.type = 'color'; pick.className = 'bdc-pick' + (/^#/.test(cur) ? ' on' : ''); pick.title = 'Any color'; pick.value = /^#[0-9a-f]{6}$/i.test(cur) ? cur : '#888888';
      pick.addEventListener('input', () => saveLook({ [key]: pick.value })); box.appendChild(pick);
      return box;
    };
    const isHiker = look3d().shape === 'hiker';
    row(isHiker ? 'Body' : 'Color', sw(BODY, L.color, 'color'));
    if (!isHiker) row('Glow', sw(GLOW, L.glow, 'glow'));
    const chips = (map, cur, key) => {
      const box = el('div', 'bdc-extras');
      for (const [k, v] of Object.entries(map)) { const b = el('button', 'bdc-ex' + (cur === k ? ' on' : '')); b.title = v[1]; b.append(el('span', null, v[0]), el('small', null, v[1])); b.addEventListener('click', () => saveLook({ [key]: k })); box.appendChild(b); }
      return box;
    };
    const L3 = look3d();
    row('Shape', chips(SHAPES, L3.shape, 'shape'));
    if (L3.shape === 'hiker') {
      row('Eyes', chips(EYES, L3.eyes, 'eyes'));
      row('Mouth', chips(MOUTHS, L3.mouth, 'mouth'));
      row('Outfit', sw(BODY, L3.outfit, 'outfit'));
      const gear = el('div', 'bdc-extras');
      for (const [k, label] of [['backpack', '🎒 Backpack'], ['scarf', '🧣 Scarf']]) { const b = el('button', 'bdc-ex' + (L3[k] ? ' on' : ''), label); b.addEventListener('click', () => saveLook({ [k]: !L3[k] })); gear.appendChild(b); }
      row('Gear', gear);
    }
    row('Hat', chips(HATS, L3.hat, 'hat'));
    row('Glasses', chips(GLASSES, L3.glasses, 'glasses'));
    const ph = el('div', 'bdc-photo');
    const up = el('label', 'pill small'); const file = el('input'); file.type = 'file'; file.accept = 'image/*'; file.hidden = true;
    up.append(file, document.createTextNode(L.image ? 'Change picture' : 'Use a picture…'));
    file.addEventListener('change', () => {
      const f = file.files[0]; file.value = ''; if (!f || !/^image\//.test(f.type)) return;
      const im = new Image(); const url = URL.createObjectURL(f);
      im.onload = () => { const n = 160, c = document.createElement('canvas'); c.width = c.height = n; const s = Math.min(im.width, im.height); c.getContext('2d').drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, n, n); URL.revokeObjectURL(url); saveLook({ image: c.toDataURL('image/jpeg', 0.85) }); };
      im.onerror = () => URL.revokeObjectURL(url);
      im.src = url;
    });
    ph.appendChild(up);
    if (L.image) { const rm = el('button', 'pill small', 'Use the robot'); rm.addEventListener('click', () => saveLook({ image: '' })); ph.appendChild(rm); }
    row('Picture', ph);
    const done = el('div', 'bdc-done'); const d = el('button', 'pill solid', 'Done'); d.addEventListener('click', toggleCustom); const rs = el('button', 'pill', 'Reset');
    rs.addEventListener('click', () => saveLook({ name: 'Buddy', color: 'clay', glow: 'cyan', extra: 'none', shape: 'hiker', hat: 'none', glasses: 'none', image: '', eyes: 'dot', mouth: 'smile', outfit: 'sky', backpack: true, scarf: true }));
    done.append(rs, d); custom.appendChild(done);
    applyLook();
  }
  function toggleCustom() {
    const on = custom.classList.contains('hidden');
    custom.classList.toggle('hidden', !on); log.classList.toggle('hidden', on); chips.classList.toggle('hidden', on); form.classList.toggle('hidden', on);
    editBtn.classList.toggle('on', on);
    if (on) paintCustom(); else { if (previewB3) { previewB3.destroy(); previewB3 = null; } previewBox = null; applyLook(); if (!log.querySelector('.bd-msg.me')) greet(); }
  }
  editBtn.addEventListener('click', toggleCustom);
  api.on('settings:changed', () => setTimeout(applyLook, 0));
  call('settings:get').then((s) => { if (s) { settings.buddyLook = s.buddyLook; applyLook(); } }).catch(() => {});
  applyLook();

  window.buddy = { el: root, ask, show: showBuddy, hide: hideBuddy };   // for self-tests
})();
