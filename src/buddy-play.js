'use strict';
/* Buddy, the playful parts: pick Buddy up and throw it (gravity, bounces, lands on its feet, dizzy when thrown
   hard), and "Ask Buddy" on highlighted text — Buddy jumps onto the highlighted line and explains it in a
   game-style speech bubble. Uses buddy.js (window.buddy) and renderer.js globals ($, el, call, api, settings). */
(() => {
  const B = window.buddy; if (!B) return;
  const root = B.el, avatar = root.querySelector('.bd-avatar'), content = $('content');
  const G = 2600, BOUNCE = 0.42, FRICTION = 0.86;
  const p = { x: 0, y: 0, vx: 0, vy: 0, free: false, held: false, raf: 0, perch: null, lastT: 0, trail: [] };
  const b3 = () => B.b3 && B.b3();
  const box = () => content.getBoundingClientRect();
  const size = () => { const r = avatar.getBoundingClientRect(); return { w: r.width || 116, h: r.height || 128 }; };

  // Free mode: Buddy is positioned by physics instead of sitting in the corner.
  function makeFree() {
    if (p.free) return;
    const c = box(), r = avatar.getBoundingClientRect();
    p.x = r.left - c.left; p.y = r.top - c.top; p.free = true;
    root.classList.add('free'); root.classList.remove('open');
    place();
  }
  function place() { root.style.left = Math.round(p.x) + 'px'; root.style.top = Math.round(p.y) + 'px'; avatar.style.transform = `rotate(${Math.max(-25, Math.min(25, p.vx * 0.012))}deg)`; }
  // The floor, or the highlighted line Buddy is standing on (caught even if it crossed it between frames).
  function floorAt(x, prevY) {
    const c = box(), { w, h } = size();
    let floor = c.height - h;
    const top = p.perch && p.perch.y - h;
    if (p.perch && x + w * 0.5 > p.perch.x0 && x + w * 0.5 < p.perch.x1 && prevY <= top + 2) floor = Math.min(floor, top);
    return floor;
  }
  function step(now) {
    p.raf = 0;
    if (p.held || !p.free) return;
    const dt = Math.min(0.033, (now - (p.lastT || now)) / 1000 || 0.016); p.lastT = now;
    const c = box(), { w } = size();
    const prevY = p.y;
    p.vy += G * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.x < 0) { p.x = 0; p.vx = -p.vx * 0.5; }
    if (p.x > c.width - w) { p.x = c.width - w; p.vx = -p.vx * 0.5; }
    if (p.y < 0) { p.y = 0; p.vy = Math.abs(p.vy) * 0.3; }
    const floor = floorAt(p.x, prevY);
    let grounded = false;
    if (p.y >= floor) {
      p.y = floor;
      if (p.vy > 320) { const k = b3(); if (k) k.land(Math.min(1, p.vy / 2200)); p.vy = -p.vy * BOUNCE; }
      else { p.vy = 0; grounded = true; p.vx *= Math.pow(FRICTION, dt * 60); }
    }
    const k = b3(); if (k) k.setState({ walking: grounded && Math.abs(p.vx) > 40 });
    place();
    if (grounded && Math.abs(p.vx) < 6) { p.vx = 0; place(); if (p.onRest) { const f = p.onRest; p.onRest = null; f(); } return; }
    p.raf = requestAnimationFrame(step);
  }
  const run = () => { if (!p.raf) { p.lastT = 0; p.raf = requestAnimationFrame(step); } };

  // Jump to a spot with a ballistic arc (used for "go home" and "jump to the highlighted text").
  function jumpTo(tx, ty) {
    makeFree();
    return new Promise((resolve) => {
      const dx = tx - p.x, dy = ty - p.y;
      // Flight time: long enough to arrive falling (so it lands on the spot from above)…
      let tFlight = Math.max(0.45, Math.min(0.9, Math.hypot(dx, dy) / 900));
      if (dy < 0) tFlight = Math.max(tFlight, Math.sqrt(-2 * dy / G) * 1.2);
      let vy = (dy - 0.5 * G * tFlight * tFlight) / tFlight;
      // …but never so high that the arc leaves the top of the window (apex = y − vy²/2G)
      if (vy < 0 && p.y - (vy * vy) / (2 * G) < 0) { vy = -Math.sqrt(2 * G * Math.max(0, p.y)); tFlight = (-vy + Math.sqrt(vy * vy + 2 * G * dy)) / G; }
      p.vx = dx / tFlight; p.vy = vy;
      p.onRest = resolve; run();
      setTimeout(() => { if (p.onRest === resolve) { p.onRest = null; resolve(); } }, 2500);
    });
  }
  function dockSpot() { const c = box(), { w, h } = size(); return { x: c.width - w - 2, y: c.height - h + 4 }; }
  async function goHome() {
    if (!p.free) return;
    p.perch = null;
    const d = dockSpot(); await jumpTo(d.x, d.y);
    root.classList.remove('free'); root.style.left = root.style.top = ''; avatar.style.transform = ''; p.free = false;
  }

  // ---- pick up and throw
  let down = null;
  avatar.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    down = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
  });
  addEventListener('pointermove', (e) => {
    if (!down || e.pointerId !== down.id) return;
    if (!down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) return;
    if (!down.moved) {
      down.moved = true; makeFree(); cancelAnimationFrame(p.raf); p.raf = 0; p.held = true; p.perch = null; hideSpeech();
      try { avatar.setPointerCapture(e.pointerId); } catch {}   // keep the pointer even over web pages
      const r = avatar.getBoundingClientRect(); down.ox = e.clientX - r.left; down.oy = e.clientY - r.top;
      root.classList.add('held'); const k = b3(); if (k) k.setState({ held: true, walking: false });
      document.body.classList.add('buddy-held');
    }
    const c = box();
    p.x = e.clientX - c.left - down.ox; p.y = e.clientY - c.top - down.oy;
    p.trail.push({ x: p.x, y: p.y, t: performance.now() }); if (p.trail.length > 6) p.trail.shift();
    const a = p.trail[0], z = p.trail[p.trail.length - 1], dt = (z.t - a.t) / 1000 || 0.016;
    p.vx = (z.x - a.x) / dt; p.vy = (z.y - a.y) / dt;
    place();
  });
  addEventListener('pointerup', (e) => {
    if (!down || e.pointerId !== down.id) return;
    const moved = down.moved; down = null;
    if (!moved) return;   // a plain click: buddy.js opens the chat
    avatar.dataset.dragged = '1'; setTimeout(() => delete avatar.dataset.dragged, 0);
    p.held = false; p.trail = []; root.classList.remove('held'); document.body.classList.remove('buddy-held');
    const k = b3(); if (k) k.setState({ held: false });
    p.vx = Math.max(-3500, Math.min(3500, p.vx)); p.vy = Math.max(-3500, Math.min(3500, p.vy));
    run();
  });
  addEventListener('resize', () => { if (p.free && !p.held) { const c = box(), { w } = size(); p.x = Math.min(p.x, c.width - w); run(); } });

  // ---- "Ask Buddy" on highlighted text
  const pill = el('button', 'ask-pill hidden'); pill.innerHTML = '<span class="ask-dot"></span>';
  pill.appendChild(document.createTextNode('Ask ')); const pillName = el('b', null, 'Buddy'); pill.appendChild(pillName);
  content.appendChild(pill);
  let sel = null, hideT;
  window.onPageSelection = (tab, s) => {
    clearTimeout(hideT);
    const buddyOn = !(settings.buddy && settings.buddy.enabled === false);
    if (!s || !s.text || !buddyOn || tab.id !== activeId || !tab.wv) { hideT = setTimeout(() => { if (!pill.matches(':hover')) pill.classList.add('hidden'); }, 120); return; }
    const c = box(), wr = tab.wv.getBoundingClientRect(), z = tab.zoom || 1;
    sel = { text: s.text, tab, left: wr.left - c.left + s.x * z, top: wr.top - c.top + s.y * z, right: wr.left - c.left + (s.x + s.w) * z, bottom: wr.top - c.top + (s.y + s.h) * z };
    // "Ask Max" when your buddy is called Max.
    pillName.textContent = String((settings.buddyLook && settings.buddyLook.name) || '').trim() || 'Buddy';
    pill.classList.remove('hidden');
    // Centered just under the highlighted text (above it when there's no room below).
    const pw = pill.offsetWidth || 120, ph = pill.offsetHeight || 32;
    const below = sel.bottom + 8, top = below + ph > c.height - 4 ? sel.top - ph - 8 : below;
    pill.style.left = Math.round(Math.min(c.width - pw - 8, Math.max(8, (sel.left + sel.right) / 2 - pw / 2))) + 'px';
    pill.style.top = Math.round(Math.max(4, Math.min(c.height - ph - 4, top))) + 'px';
    pill.classList.remove('pill-pop'); void pill.offsetWidth; pill.classList.add('pill-pop');
  };
  pill.addEventListener('mousedown', (e) => e.preventDefault());
  pill.addEventListener('click', () => { pill.classList.add('hidden'); if (sel) explain(sel); });

  // ---- game-style speech bubble
  const speech = el('div', 'bd-speech hidden');
  const nameTag = el('div', 'bs-name'); const textEl = el('div', 'bs-text'); const more = el('div', 'bs-foot');
  const toChat = el('button', 'bs-btn', 'Keep chatting ▸'); const closeS = el('button', 'bs-btn ghost', 'Close');
  more.append(closeS, toChat); speech.append(nameTag, textEl, more); content.appendChild(speech);
  let full = '', shown = 0, typing = 0, explaining = false;
  function placeSpeech() {
    const c = box(), { w } = size(), sw = Math.min(360, c.width - 24);
    speech.style.width = sw + 'px';
    const left = Math.max(12, Math.min(c.width - sw - 12, p.x + w / 2 - sw / 2));
    const above = p.y - speech.offsetHeight - 10;
    speech.style.left = left + 'px';
    speech.style.top = (above > 8 ? above : Math.min(c.height - speech.offsetHeight - 8, p.y + size().h + 6)) + 'px';
    speech.classList.toggle('below', above <= 8);
    speech.style.setProperty('--tail', Math.round(p.x + w / 2 - left) + 'px');
  }
  function typeOn() {
    typing = 0;
    if (shown < full.length) { shown = Math.min(full.length, shown + Math.max(1, Math.round((full.length - shown) / 30))); textEl.textContent = full.slice(0, shown); placeSpeech(); typing = requestAnimationFrame(typeOn); }
  }
  function say(t, append) { full = append ? full + t : t; if (!append) shown = 0; if (!typing) typing = requestAnimationFrame(typeOn); }
  function hideSpeech() { speech.classList.add('hidden'); explaining = false; cancelAnimationFrame(typing); typing = 0; }
  closeS.addEventListener('click', () => { hideSpeech(); p.perch = null; run(); });
  toChat.addEventListener('click', async () => { hideSpeech(); await goHome(); await B.show(); });
  api.on('buddy:delta', (d) => { if (!explaining) return; say(d, true); const k = b3(); if (k) { k.setState({ talking: true }); clearTimeout(say.t); say.t = setTimeout(() => k.setState({ talking: false }), 400); } });

  async function explain(s) {
    await B.show({ panel: false });
    root.classList.remove('open');
    const c = box(), { w, h } = size();
    // Stand on the highlighted line, beside the text — or just under it when there's no room above.
    const tx = Math.max(0, Math.min(c.width - w, s.right + 8 > c.width - w ? s.left - w - 8 : s.right + 8));
    const standY = s.bottom + 4 - h > 24 ? s.bottom + 4 : Math.min(c.height, s.bottom + h + 12);
    p.perch = { x0: tx - 30, x1: tx + w + 30, y: standY };
    if (!p.free) makeFree();
    await jumpTo(tx, standY - h);
    nameTag.textContent = (settings.buddyLook && settings.buddyLook.name) || 'Buddy';
    full = ''; shown = 0; textEl.textContent = ''; speech.classList.remove('hidden'); placeSpeech();
    const status = await call('buddy:status').catch(() => ({}));
    if (!status.ready) { say('I need an AI to think with first! Pick one in Settings → AI buddy (there’s even a free one).'); toChat.textContent = 'Open settings ▸'; toChat.onclick = () => { hideSpeech(); openUrlInternal('settings', '#buddy'); }; return; }
    toChat.textContent = 'Keep chatting ▸'; toChat.onclick = null;
    explaining = true; textEl.classList.add('thinking');
    const k = b3(); if (k) k.setState({ busy: true });
    const res = await call('buddy:ask', { text: `Explain this in simple words, in 2–4 short sentences:\n\n"${s.text.slice(0, 1500)}"`, look: false }).catch(() => ({ ok: false }));
    textEl.classList.remove('thinking');
    if (k) k.setState({ busy: false, happy: !!res.ok });
    explaining = false;
    if (!res.ok && !full) say(res.error === 'badkey' ? 'Hmm, my API key didn’t work. Check it in Settings → AI buddy.' : res.error === 'offline' ? 'I can’t reach the internet right now.' : 'Oops, I couldn’t answer that one.');
  }

  window.buddyPlay = { goHome, explain, isFree: () => p.free };
})();
