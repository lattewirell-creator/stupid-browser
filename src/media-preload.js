'use strict';
// Runs in every web page (tabs, sidebar apps). Remembers the page's own media-session handlers
// (play/pause/next/previous) so the browser's music island can press them, and exposes the
// "now playing" info. Installed in the page's main world before any page script runs.
const { contextBridge, ipcRenderer } = require('electron');
if (window.top === window && /^https?:$/.test(location.protocol)) {
  try {
    contextBridge.executeInMainWorld({
      func: () => {
        const ms = navigator.mediaSession;
        if (!ms || window.__stupidMedia) return;
        const handlers = {};
        const orig = ms.setActionHandler.bind(ms);
        ms.setActionHandler = (action, fn) => { handlers[action] = fn; return orig(action, fn); };
        const els = () => [...document.querySelectorAll('video, audio')];
        const playing = () => els().find((m) => !m.paused && !m.ended && m.currentTime > 0);
        const info = () => {
          const md = ms.metadata;
          const m = playing() || els().find((x) => x.currentTime > 0) || null;
          let art = '';
          if (md && md.artwork && md.artwork.length) art = md.artwork[md.artwork.length - 1].src || '';
          return {
            title: (md && md.title) || '', artist: (md && md.artist) || '', album: (md && md.album) || '', art,
            state: ms.playbackState !== 'none' ? ms.playbackState : (m ? (m.paused ? 'paused' : 'playing') : 'none'),
            position: m && isFinite(m.currentTime) ? m.currentTime : 0,
            duration: m && isFinite(m.duration) ? m.duration : 0,
            canPrev: !!handlers.previoustrack, canNext: !!handlers.nexttrack,
            queueSize: readQueue().length
          };
        };
        // Playlist / queue. No web standard for this, so read the big players' own lists.
        const txt = (e) => ((e && e.textContent) || '').replace(/\s+/g, ' ').trim();
        const imgOf = (r) => { const i = r.querySelector('img'); const s = i && (i.currentSrc || i.src); return s && /^https:/.test(s) ? s : ''; };
        let rows = [];
        const readQueue = () => {
          const h = location.hostname;
          let list = [];
          if (h === 'music.youtube.com') {
            list = [...document.querySelectorAll('ytmusic-player-queue ytmusic-player-queue-item')].map((r) => ({
              el: r, title: txt(r.querySelector('.song-title')), artist: txt(r.querySelector('.byline')), art: imgOf(r),
              current: r.hasAttribute('selected') || /play|pause/.test(r.getAttribute('play-button-state') || '') }));
          } else if (/(^|\.)youtube\.com$/.test(h)) {
            const panel = document.querySelector('ytd-watch-flexy ytd-playlist-panel-renderer#playlist') || document.querySelector('ytd-playlist-panel-renderer');
            if (panel) list = [...panel.querySelectorAll('ytd-playlist-panel-video-renderer')].map((r) => ({
              el: r, title: txt(r.querySelector('#video-title')), artist: txt(r.querySelector('#byline')), art: imgOf(r), current: r.hasAttribute('selected') }));
          } else if (h === 'open.spotify.com') {
            list = [...document.querySelectorAll('[data-testid="tracklist-row"]')].map((r) => ({
              el: r, title: txt(r.querySelector('[data-testid="internal-track-link"]')) || txt(r.querySelector('div[dir="auto"]')),
              artist: [...r.querySelectorAll('a[href*="/artist/"]')].map(txt).join(', '), art: imgOf(r), current: false }));
          }
          list = list.filter((x) => x.title).slice(0, 200);
          const md = ms.metadata;
          if (md && md.title && !list.some((x) => x.current)) { const m = list.find((x) => x.title === md.title); if (m) m.current = true; }
          rows = list;
          return list;
        };
        const queue = () => readQueue().map(({ title, artist, art, current }) => ({ title, artist, art, current }));
        const playAt = (i) => {
          const r = rows[i] && rows[i].el; if (!r || !r.isConnected) return false;
          const h = location.hostname;
          if (h === 'music.youtube.com') (r.querySelector('ytmusic-play-button-renderer') || r.querySelector('.song-info') || r).click();
          else if (/(^|\.)youtube\.com$/.test(h)) (r.querySelector('a#wc-endpoint') || r.querySelector('a') || r).click();
          else r.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
          return true;
        };
        const act = (action) => {
          const h = handlers[action];
          if (h) { try { h({ action }); return true; } catch {} }
          if (action === 'play' || action === 'pause' || action === 'toggle') {
            const m = playing() || els().find((x) => x.currentTime > 0) || els()[0];
            if (!m) return false;
            if (action === 'toggle') action = m.paused ? 'play' : 'pause';
            if (handlers[action]) { try { handlers[action]({ action }); return true; } catch {} }
            if (action === 'play') m.play().catch(() => {}); else m.pause();
            return true;
          }
          return false;
        };
        // Equalizer: media elements are routed through 8 filters while the EQ is on.
        // Skipped for DRM players (protected audio turns silent in Web Audio) and cross-origin media without CORS.
        const BANDS = [60, 150, 400, 1000, 2400, 6000, 10000, 15000];
        const DRM_HOSTS = /(^|\.)(spotify\.com|netflix\.com|disneyplus\.com|primevideo\.com|amazon\.[a-z.]+|music\.apple\.com|tv\.apple\.com|tidal\.com|hbomax\.com|max\.com|hulu\.com)$/;
        let curve = { on: false, gains: BANDS.map(() => 0) };
        let ctx = null; const graphs = []; const hooked = new WeakSet();
        const active = () => curve.on && curve.gains.some((g) => g !== 0);
        const usable = (m) => {
          if (DRM_HOSTS.test(location.hostname) || m.mediaKeys) return false;
          const src = m.currentSrc || m.src || '';
          if (!src || /^(blob|data):/.test(src)) return true;
          try { return new URL(src, location.href).origin === location.origin || m.crossOrigin != null; } catch { return false; }
        };
        const level = () => { for (const x of graphs) {
          x.filters.forEach((f, i) => f.gain.setTargetAtTime(curve.on ? curve.gains[i] : 0, ctx.currentTime, 0.03));
          const peak = curve.on ? Math.max(0, ...curve.gains) : 0;    // headroom so boosts don't clip
          x.pre.gain.setTargetAtTime(Math.pow(10, -peak * 0.6 / 20), ctx.currentTime, 0.03);
        } };
        const attach = (m) => {
          if (!(m instanceof HTMLMediaElement) || hooked.has(m) || !active() || !usable(m)) return;
          if (!ctx) ctx = new AudioContext();
          // Only take over the element once audio can actually run, or it would go silent.
          if (ctx.state !== 'running') { ctx.resume().then(() => { if (ctx.state === 'running') attach(m); }).catch(() => {}); return; }
          try {
            const src = ctx.createMediaElementSource(m);
            let node = src;
            const filters = BANDS.map((f, i) => {
              const b = ctx.createBiquadFilter();
              b.type = i === 0 ? 'lowshelf' : i === BANDS.length - 1 ? 'highshelf' : 'peaking';
              b.frequency.value = f; b.Q.value = 1.1; b.gain.value = 0;
              node.connect(b); node = b; return b;
            });
            const pre = ctx.createGain(); node.connect(pre); pre.connect(ctx.destination);
            hooked.add(m); graphs.push({ filters, pre }); level();
          } catch {}
        };
        document.addEventListener('play', (e) => attach(e.target), true);
        const setEq = (eq) => {
          if (!eq || !Array.isArray(eq.gains)) return;
          curve = { on: !!eq.on, gains: BANDS.map((_, i) => Math.max(-12, Math.min(12, +eq.gains[i] || 0))) };
          if (ctx) level();
          if (active()) document.querySelectorAll('video, audio').forEach((m) => { if (!m.paused) attach(m); });
        };
        Object.defineProperty(window, '__stupidMedia', { value: Object.freeze({ info, act, queue, playAt, setEq }) });
      }
    });
  } catch {}
  const pushEq = (eq) => { try { contextBridge.executeInMainWorld({ func: (q) => { if (window.__stupidMedia) window.__stupidMedia.setEq(q); }, args: [eq] }); } catch {} };
  ipcRenderer.invoke('eq:get').then(pushEq).catch(() => {});
  ipcRenderer.on('eq:update', (_e, eq) => pushEq(eq));
}
