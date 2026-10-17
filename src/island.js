'use strict';
/* Music island: when music plays in a tab or sidebar app you're not looking at, a small
   "now playing" pill floats at the top of the page. Hover it for controls, click it to jump there.
   Uses renderer.js globals (tabs, appViews, sideItems, activeApp, settings, activate_, openApp). */
(() => {
  const IC = {
    play: '<path d="M8 5.5v13l11-6.5z" class="fill"/>',
    pause: '<rect x="6.5" y="5" width="4" height="14" rx="1.2" class="fill"/><rect x="13.5" y="5" width="4" height="14" rx="1.2" class="fill"/>',
    next: '<path d="M5 5.5v13l9.5-6.5z" class="fill"/><rect x="16" y="5.5" width="2.6" height="13" rx="1.1" class="fill"/>',
    prev: '<path d="M19 5.5v13l-9.5-6.5z" class="fill"/><rect x="5.4" y="5.5" width="2.6" height="13" rx="1.1" class="fill"/>',
    x: '<path d="M7 7l10 10M17 7L7 17"/>',
    list: '<path d="M4 6.5h11M4 12h11M4 17.5h7"/><path d="M17 15.5v-9l3.5 1.5" /><circle cx="15.3" cy="16.5" r="1.9" class="fill"/>',
    note: '<path d="M9 17V6l10-2v11"/><circle cx="6.5" cy="17" r="2.5" class="fill"/><circle cx="16.5" cy="15" r="2.5" class="fill"/>'
  };
  const mk = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
  const icon = (name) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.innerHTML = IC[name]; return s; };
  const btn = (cls, name, title) => { const b = mk('button', 'isl-btn ' + cls); b.title = title; b.appendChild(icon(name)); return b; };

  // ---- DOM
  const root = mk('div', 'gone'); root.id = 'island';
  const artBox = mk('div', 'isl-art'); const art = mk('img'); art.draggable = false; artBox.append(art, icon('note'));
  const text = mk('div', 'isl-text'); const title = mk('div', 'isl-title'); const sub = mk('div', 'isl-sub'); text.append(title, sub);
  const eq = mk('div', 'isl-eq'); for (let i = 0; i < 4; i++) eq.appendChild(mk('i'));
  const close = btn('isl-x', 'x', 'Hide');
  const bar = mk('div', 'isl-bar'); const fill = mk('i'); bar.appendChild(fill);
  const ctrls = mk('div', 'isl-ctrls');
  const prev = btn('', 'prev', 'Previous'); const play = btn('isl-play', 'pause', 'Pause'); const next = btn('', 'next', 'Next');
  const listBtn = btn('isl-list-btn', 'list', 'Playlist');
  ctrls.append(listBtn, prev, play, next);
  const list = mk('div', 'isl-list');
  root.append(artBox, text, eq, close, bar, ctrls, list);
  document.getElementById('content').appendChild(root);
  art.addEventListener('load', () => artBox.classList.add('has-art'));
  art.addEventListener('error', () => artBox.classList.remove('has-art'));

  // ---- position: drag the island anywhere over the page; remembered in settings.islandPos
  const content = document.getElementById('content');
  function place(pos) {
    const cw = content.clientWidth, ch = content.clientHeight, half = 180;
    const p = pos || settings.islandPos;
    const x = p ? p.x * cw : cw / 2, y = p ? p.y * ch : 8;
    root.style.left = Math.round(Math.max(Math.min(half + 8, cw / 2), Math.min(cw - Math.min(half + 8, cw / 2), x))) + 'px';
    root.style.top = Math.round(Math.max(6, Math.min(ch - 50, y))) + 'px';
  }
  let drag = null, justDragged = false;
  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.isl-btn, .isl-list')) return;
    const r = root.getBoundingClientRect(), c = content.getBoundingClientRect();
    drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, cx: r.left + r.width / 2 - c.left, cy: r.top - c.top, moved: false };
  });
  root.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    if (!drag.moved) { drag.moved = true; try { root.setPointerCapture(e.pointerId); } catch {} root.classList.add('dragging'); root.classList.remove('open', 'listing'); }
    place({ x: (drag.cx + dx) / content.clientWidth, y: (drag.cy + dy) / content.clientHeight });
  });
  const endDrag = () => {
    if (!drag) return;
    if (drag.moved) {
      justDragged = true; setTimeout(() => { justDragged = false; }, 0);
      root.classList.remove('dragging');
      const r = root.getBoundingClientRect(), c = content.getBoundingClientRect();
      const pos = { x: (r.left + r.width / 2 - c.left) / c.width, y: (r.top - c.top) / c.height };
      settings.islandPos = pos; call('settings:set', { islandPos: pos });
    }
    drag = null;
  };
  root.addEventListener('pointerup', endDrag);
  root.addEventListener('pointercancel', endDrag);
  root.addEventListener('dblclick', (e) => { if (e.target.closest('.isl-btn, .isl-list')) return; settings.islandPos = null; call('settings:set', { islandPos: null }); place(); });
  addEventListener('resize', () => place());

  // ---- sources: every tab and sidebar app webview
  function sources() {
    const out = [];
    for (const t of tabs) {
      if (!t.wv || !t.ready) continue;
      out.push({ key: 't' + t.id, wv: t.wv, visible: t.wv.classList.contains('visible'), name: t.title || '', go: () => activate_(t.id) });
    }
    const panelOpen = !document.getElementById('appPanel').classList.contains('hidden');
    for (const [id, wv] of appViews) {
      const it = sideItems.find((x) => x.id === id);
      out.push({ key: 'a' + id, wv, visible: panelOpen && activeApp === id, name: it ? it.name : '', go: () => openApp(id) });
    }
    return out;
  }
  const audible = (wv) => { try { return wv.isCurrentlyAudible(); } catch { return false; } };
  const readInfo = (wv) => wv.executeJavaScript('window.__stupidMedia ? window.__stupidMedia.info() : null').catch(() => null);
  const act = (wv, a) => wv.executeJavaScript(`window.__stupidMedia ? window.__stupidMedia.act(${JSON.stringify(a)}) : false`).catch(() => false);

  let cur = null;          // { key, wv, go, ... }
  let last = null;         // last info
  let idle = 0;            // polls with nothing playing and nothing to show
  let dismissed = null;    // "key|title" the user closed
  const enabled = () => settings.musicIsland !== false;

  let polling = false;
  async function poll() {
    if (polling || document.hidden) return;
    polling = true;
    try { await pollSource(); } finally { polling = false; }
  }
  let pausedHere = false;   // paused from the island (vs. from the website)
  async function pollSource() {
    if (!enabled()) { hide(); return; }
    const list = sources();
    const live = list.filter((s) => audible(s.wv));
    if (cur) { const again = list.find((s) => s.key === cur.key); cur = again || null; }
    // Follow whatever is actually making sound now; keep a paused source so you can resume it.
    if (live.length && (!cur || !live.some((s) => s.key === cur.key))) { cur = live[0]; idle = 0; }
    if (!cur) { hide(); return; }
    const source = cur;
    const info = await readInfo(source.wv);
    if (!source.wv.isConnected || cur !== source) return;
    const sounding = audible(cur.wv);
    const hasMedia = info && (info.title || info.state === 'playing' || info.state === 'paused');
    if (!sounding && !hasMedia) { if (++idle > 4) { cur = null; hide(); } return; }
    idle = 0;
    last = Object.assign({ title: '', artist: '', art: '', state: 'playing', position: 0, duration: 0, canPrev: false, canNext: false }, info || {});
    if (!info) last.state = sounding ? 'playing' : 'paused';
    const tag = cur.key + '|' + (last.title || cur.name);
    if (dismissed && dismissed !== tag) dismissed = null;
    if (cur.visible || dismissed === tag) { hide(); return; }
    // Only while something plays. Paused on the website → hide; paused with the island's own button → stay, so you can resume.
    if (last.state === 'playing' || sounding) pausedHere = false;
    else if (!pausedHere) { hide(); return; }
    render(!!info);
  }

  function render(controllable) {
    const playing = last.state === 'playing';
    title.textContent = last.title || cur.name || 'Playing audio';
    sub.textContent = last.artist || (last.title ? cur.name : '');
    const src = /^(https:|data:image\/)/.test(last.art) ? last.art : '';
    if (art.getAttribute('src') !== src) { artBox.classList.remove('has-art'); if (src) art.src = src; else art.removeAttribute('src'); }
    root.classList.toggle('playing', playing);
    root.classList.toggle('no-ctrl', !controllable);
    play.replaceChildren(icon(playing ? 'pause' : 'play')); play.title = playing ? 'Pause' : 'Play';
    prev.disabled = !last.canPrev; next.disabled = !last.canNext;
    listBtn.classList.toggle('hidden', !(last.queueSize > 1));
    if (!(last.queueSize > 1)) root.classList.remove('listing');
    if (root.classList.contains('listing')) refreshList();
    const pct = last.duration > 0 ? Math.min(100, (last.position / last.duration) * 100) : 0;
    bar.classList.toggle('none', !(last.duration > 0 && isFinite(last.duration)));
    fill.style.width = pct + '%';
    if (root.classList.contains('gone')) place();
    root.classList.remove('gone');
  }
  function hide() { root.classList.add('gone'); root.classList.remove('open', 'listing'); }

  // ---- playlist panel
  let listSig = '';
  async function refreshList() {
    if (!cur) return;
    const q = await cur.wv.executeJavaScript('window.__stupidMedia ? window.__stupidMedia.queue() : []').catch(() => []);
    const sig = JSON.stringify(q);
    if (sig === listSig) return;
    listSig = sig;
    list.replaceChildren();
    const head = mk('div', 'isl-list-head'); head.textContent = `Playlist · ${q.length} songs`;
    list.appendChild(head);
    q.forEach((it, i) => {
      const row = mk('button', 'isl-row' + (it.current ? ' current' : ''));
      const th = mk('span', 'isl-thumb');
      if (/^https:/.test(it.art || '')) { const im = mk('img'); im.src = it.art; im.draggable = false; im.onerror = () => im.remove(); th.appendChild(im); }
      else th.textContent = String(i + 1);
      const tx = mk('span', 'isl-row-text'); const a = mk('b'); a.textContent = it.title; const b = mk('small'); b.textContent = it.artist || '';
      tx.append(a, b);
      row.append(th, tx);
      if (it.current) { const e = mk('span', 'isl-eq mini'); for (let k = 0; k < 3; k++) e.appendChild(mk('i')); row.appendChild(e); }
      row.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        await cur.wv.executeJavaScript(`window.__stupidMedia && window.__stupidMedia.playAt(${i})`).catch(() => {});
        setTimeout(poll, 600);
      });
      list.appendChild(row);
    });
    const c = list.querySelector('.current');
    if (c && !list.__scrolled) { c.scrollIntoView({ block: 'center' }); list.__scrolled = true; }
  }
  listBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const on = !root.classList.contains('listing');
    root.classList.toggle('listing', on);
    listBtn.classList.toggle('on', on);
    if (on) { listSig = ''; list.__scrolled = false; refreshList(); }
  });

  // ---- interaction
  let openT;
  root.addEventListener('mouseenter', () => { clearTimeout(openT); openT = setTimeout(() => root.classList.add('open'), 120); });
  root.addEventListener('mouseleave', () => {
    clearTimeout(openT);
    if (root.classList.contains('listing')) { openT = setTimeout(() => { root.classList.remove('open', 'listing'); listBtn.classList.remove('on'); }, 1200); return; }
    root.classList.remove('open');
  });
  root.addEventListener('click', (e) => {
    if (justDragged || e.target.closest('.isl-btn, .isl-list, .isl-bar')) return;
    if (cur) { cur.go(); hide(); }
  });
  const press = (a) => async (e) => {
    e.stopPropagation(); if (!cur) return;
    if (a === 'toggle') { pausedHere = last.state === 'playing'; last.state = pausedHere ? 'paused' : 'playing'; render(true); }
    await act(cur.wv, a);
    setTimeout(poll, 350);
  };
  play.addEventListener('click', press('toggle'));
  prev.addEventListener('click', press('previoustrack'));
  next.addEventListener('click', press('nexttrack'));
  close.addEventListener('click', (e) => { e.stopPropagation(); if (cur) dismissed = cur.key + '|' + (last.title || cur.name); hide(); });

  setInterval(poll, 1000);
  place();
  window.musicIsland = { poll, el: root };   // for self-tests
})();
