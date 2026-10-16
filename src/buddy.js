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
    headEl.append(el('span', 'bot-ear l'), el('span', 'bot-ear r'), visor, el('span', 'bot-shine'));
    fl.append(ant, headEl);
    b.append(el('span', 'bot-shadow'), fl);
    return b;
  };
  const face = () => bot('mini');
  const titleBox = el('div', 'bd-titles'); const modelLine = el('small', null, '');
  titleBox.append(el('b', null, 'Buddy'), modelLine);
  const newBtn = el('button', 'icon-btn small'); newBtn.title = 'New chat'; newBtn.appendChild(svg('<path d="M12 5v14M5 12h14"/>'));
  const closeBtn = el('button', 'icon-btn small'); closeBtn.title = 'Hide Buddy'; closeBtn.appendChild(svg('<path d="M6 6l12 12M18 6L6 18"/>'));
  head.append(face(), titleBox, el('div', 'grow'), newBtn, closeBtn);
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
  panel.append(head, log, chips, form);
  const avatar = el('button', 'bd-avatar'); avatar.title = 'Buddy'; avatar.appendChild(bot('big'));
  root.append(panel, avatar);
  document.getElementById('content').appendChild(root);

  let status = { hasKey: false };
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
      bubble('bot', 'Hi! I’m **Buddy**. I can look at the page you’re on and answer questions about it.\n\nTo wake me up, pick an AI (Claude, ChatGPT, Gemini, Grok, a free local one with Ollama…) in Settings.');
      note('Settings → AI buddy', { label: 'Open settings', fn: () => openUrlInternal('settings', '#buddy') });
    } else bubble('bot', 'Hi! Ask me anything — I can see the tab you’re on when the 👁 is lit.');
    renderChips();
  }
  async function refreshStatus() {
    try { status = await call('buddy:status'); } catch { status = { ready: false }; }
    modelLine.textContent = status.ready ? `${status.providerName.replace(/ \(.*\)/, '')} · ${status.modelName}` : 'Not set up';
    modelLine.title = modelLine.textContent;
    root.classList.toggle('nokey', !status.ready);
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
    try { res = await call('buddy:ask', { text, look: useLook, tabWcId: useLook ? t.wv.getWebContentsId() : null }); }
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
    root.classList.add('talking'); clearTimeout(talkT); talkT = setTimeout(() => root.classList.remove('talking'), 400);
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
      root.style.setProperty('--ry', (Math.max(-1, Math.min(1, dx * 2.2)) * 28).toFixed(1) + 'deg');
      root.style.setProperty('--rx', (Math.max(-1, Math.min(1, -dy * 2.2)) * 18).toFixed(1) + 'deg');
      root.style.setProperty('--ex', (Math.max(-1, Math.min(1, dx * 3)) * 3).toFixed(1) + 'px');
      root.style.setProperty('--ey', (Math.max(-1, Math.min(1, dy * 3)) * 2).toFixed(1) + 'px');
      root.classList.add('tracking'); clearTimeout(idleT); idleT = setTimeout(() => root.classList.remove('tracking'), 2500);
    });
  });
  function setBusy(b) {
    busy = b; root.classList.toggle('busy', b);
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
  avatar.addEventListener('click', () => root.classList.toggle('open'));

  async function showBuddy() {
    await refreshStatus();
    look = !(settings.buddy && settings.buddy.look === false); lookBtn.classList.toggle('on', look);
    const wasHidden = root.classList.contains('hidden');
    root.classList.remove('hidden'); root.classList.add('open');
    $('aiBtn').classList.add('on');
    if (wasHidden && !log.querySelector('.bd-msg.me')) greet();
    setTimeout(() => input.focus(), 50);
  }
  function hideBuddy() { root.classList.add('hidden'); root.classList.remove('open'); $('aiBtn').classList.remove('on'); }
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
  window.buddy = { el: root, ask, show: showBuddy, hide: hideBuddy };   // for self-tests
})();
