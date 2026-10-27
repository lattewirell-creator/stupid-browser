'use strict';
/* Screenshots and screen recordings of part of the page (Ctrl+Shift+X, or Menu). You drag a box over the part you
 * want (or take the whole page). A screenshot is copied right away, so Ctrl+V puts it in any chat, and a small card
 * lets you drag it out (into a chat, a folder, another app) or save it. A recording films that part until you press
 * Stop, is saved in Videos, and can be dragged out the same way. */
(() => {
  /** Lets you drag a box over the page. Resolves with { x, y, width, height } in page pixels (null: cancelled,
   *  whole: the whole page) and where that is in the window. */
  function pickArea(title) {
    const tab = activeTab(); if (!tab || !tab.wv) return Promise.resolve(null);
    const box = tab.wv.getBoundingClientRect();
    return new Promise((resolve) => {
      const veil = el('div', 'cap-veil'); Object.assign(veil.style, { left: box.left + 'px', top: box.top + 'px', width: box.width + 'px', height: box.height + 'px' });
      const sel = el('div', 'cap-sel hidden'); veil.appendChild(sel);
      const bar = el('div', 'cap-bar'); bar.appendChild(el('span', null, title + ' · drag over the part you want'));
      const whole = el('button', 'pill small', 'Whole page'), cancel = el('button', 'pill small', 'Cancel');
      bar.append(whole, cancel); veil.appendChild(bar);
      document.body.appendChild(veil);
      let start = null;
      const done = (r) => { removeEventListener('keydown', key, true); veil.remove(); resolve(r); };
      const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); done(null); } else if (e.key === 'Enter') { e.preventDefault(); done({ whole: true, x: 0, y: 0, width: box.width, height: box.height, win: box }); } };
      addEventListener('keydown', key, true);
      whole.addEventListener('click', (e) => { e.stopPropagation(); done({ whole: true, x: 0, y: 0, width: box.width, height: box.height, win: box }); });
      cancel.addEventListener('click', (e) => { e.stopPropagation(); done(null); });
      veil.addEventListener('pointerdown', (e) => { if (e.target.closest('.cap-bar')) return; start = { x: e.clientX, y: e.clientY }; veil.setPointerCapture(e.pointerId); sel.classList.remove('hidden'); });
      veil.addEventListener('pointermove', (e) => {
        if (!start) return;
        const x = Math.min(start.x, e.clientX), y = Math.min(start.y, e.clientY), w = Math.abs(e.clientX - start.x), h = Math.abs(e.clientY - start.y);
        Object.assign(sel.style, { left: x - box.left + 'px', top: y - box.top + 'px', width: w + 'px', height: h + 'px' });
      });
      veil.addEventListener('pointerup', (e) => {
        if (!start) return;
        const x = Math.max(box.left, Math.min(start.x, e.clientX)), y = Math.max(box.top, Math.min(start.y, e.clientY));
        const w = Math.min(box.right, Math.max(start.x, e.clientX)) - x, h = Math.min(box.bottom, Math.max(start.y, e.clientY)) - y;
        start = null;
        if (w < 8 || h < 8) { sel.classList.add('hidden'); return; }   // a click, not a box: keep picking
        done({ x: x - box.left, y: y - box.top, width: w, height: h, win: { left: x, top: y, width: w, height: h } });
      });
    });
  }

  /** The card in the corner: a preview you can drag out, and what to do with it. */
  let card = null, cardT = 0;
  function showCard({ thumb, video, file, text }) {
    if (card) card.remove(); clearTimeout(cardT);
    card = el('div', 'cap-card');
    let pic;
    if (video) { pic = document.createElement('video'); pic.src = video; pic.muted = true; pic.loop = true; pic.autoplay = true; pic.playsInline = true; }
    else { pic = el('img'); pic.src = thumb; pic.alt = ''; }
    pic.className = 'cap-pic'; pic.draggable = true; pic.title = 'Drag it into a chat, a folder or another app';
    pic.addEventListener('dragstart', (e) => { e.preventDefault(); call('shot:drag', file); });
    const info = el('div', 'cap-info'); info.appendChild(el('b', null, text)); info.appendChild(el('small', null, 'Drag the picture into a chat, a folder or another app'));
    const acts = el('div', 'cap-acts');
    const save = el('button', 'pill small', video ? 'Show in folder' : 'Save'); save.addEventListener('click', async () => { const out = await call('shot:save', file); if (out && !video) toast('Saved in Pictures › Screenshots'); });
    const x = el('button', 'pill small', 'Close'); x.addEventListener('click', () => { card.remove(); card = null; });
    acts.append(save, x); info.appendChild(acts);
    card.append(pic, info); document.body.appendChild(card);
    card.addEventListener('mouseenter', () => clearTimeout(cardT));
    card.addEventListener('mouseleave', () => { cardT = setTimeout(() => { if (card) { card.remove(); card = null; } }, 8000); });
    cardT = setTimeout(() => { if (card) { card.remove(); card = null; } }, 25000);
  }

  async function screenshot() {
    if (recording) return;
    const tab = activeTab(); if (!tab || !tab.wv || !tab.ready) { toast('Wait for the page to load, then try again'); return; }
    const area = await pickArea('Screenshot');
    if (!area) return;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));   // the box is gone before the picture is taken
    const r = await call('shot:take', tab.wv.getWebContentsId(), area.whole ? null : { x: area.x, y: area.y, width: area.width, height: area.height }).catch(() => null);
    if (!r) { toast('Couldn’t take a screenshot of this page'); return; }
    showCard({ thumb: r.thumb, file: r.file, text: 'Copied · paste it with Ctrl+V' });
  }

  /* ---------------- recording ---------------- */
  let recording = null;
  async function record() {
    if (recording) { recording.stop(); return; }
    const area = await pickArea('Screen recording');
    if (!area) return;
    const id = await call('rec:source').catch(() => null);
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: id, maxFrameRate: 30 } } }); }
    catch { toast('Couldn’t start recording on this computer'); return; }
    const video = document.createElement('video'); video.srcObject = stream; video.muted = true; await video.play();
    // Film the whole window and keep only the part you picked.
    const scale = video.videoWidth / innerWidth;
    const a = area.win, canvas = document.createElement('canvas');
    canvas.width = Math.round(a.width * scale) & ~1; canvas.height = Math.round(a.height * scale) & ~1;
    const g = canvas.getContext('2d');
    let raf = 0; const draw = () => { g.drawImage(video, a.left * scale, a.top * scale, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height); raf = requestAnimationFrame(draw); }; draw();
    const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(canvas.captureStream(30), { mimeType: type, videoBitsPerSecond: 6e6 });
    const chunks = []; rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const frame = el('div', 'rec-frame'); Object.assign(frame.style, { left: a.left - 3 + 'px', top: a.top - 3 + 'px', width: a.width + 6 + 'px', height: a.height + 6 + 'px' });
    const pill = el('div', 'rec-pill'); const time = el('span', null, '0:00'); const stopBtn = el('button', null, 'Stop');
    pill.append(el('i'), time, stopBtn); document.body.append(frame, pill);
    const t0 = Date.now(); const tick = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); time.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }, 500);
    recording = { stop: () => rec.state !== 'inactive' && rec.stop() };
    stopBtn.addEventListener('click', () => recording && recording.stop());
    rec.onstop = async () => {
      cancelAnimationFrame(raf); clearInterval(tick); stream.getTracks().forEach((t) => t.stop()); frame.remove(); pill.remove(); recording = null;
      const blob = new Blob(chunks, { type: 'video/webm' });
      const file = await call('rec:save', new Uint8Array(await blob.arrayBuffer())).catch(() => null);
      if (!file) { toast('Couldn’t save the recording'); return; }
      showCard({ video: URL.createObjectURL(blob), file, text: 'Recording saved in Videos' });
    };
    rec.start(1000);
  }
  window.capture = { screenshot, record, recording: () => !!recording };
})();
