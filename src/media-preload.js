'use strict';
// Runs in every web page (tabs, sidebar apps). Remembers the page's own media-session handlers
// (play/pause/next/previous) so the browser's music island can press them, and exposes the
// "now playing" info. Installed in the page's main world before any page script runs.
const { contextBridge } = require('electron');
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
        Object.defineProperty(window, '__stupidMedia', { value: Object.freeze({ info, act, queue, playAt }) });
      }
    });
  } catch {}
}
