'use strict';
// On the Chrome Web Store: its own "Add to Chrome" button stays greyed out in browsers it doesn't recognise, so every
// extension's page gets ours, "Add to The Stupid Browser". Installing goes through the browser (extensions.js), which
// asks you first. Normal windows only (extensions never run in private ones).
const { ipcRenderer } = require('electron');
if (location.protocol === 'https:' && location.hostname === 'chromewebstore.google.com') {
  let host = null, shown = '';
  const idOf = () => { const m = /^\/detail\/(?:[^/]+\/)?([a-p]{32})(?:[/?#]|$)/.exec(location.pathname); return m ? m[1] : ''; };
  const render = async () => {
    const id = idOf();
    if (id === shown) return;
    shown = id;
    if (host) { host.remove(); host = null; }
    if (!id) return;
    let st = { installed: false };
    try { st = await ipcRenderer.invoke('ext:storeStatus', id); } catch {}
    if (idOf() !== id) return;
    host = document.createElement('div');
    const root = host.attachShadow({ mode: 'closed' });
    // built with DOM calls: the store enforces Trusted Types, so innerHTML is refused
    const style = document.createElement('style');
    style.textContent = `
      .b { position: fixed; right: 24px; bottom: 24px; z-index: 2147483647; display: flex; align-items: center; gap: 10px; padding: 12px 18px 12px 14px;
        border-radius: 999px; border: 0; cursor: pointer; font: 600 14px/1 system-ui, 'Segoe UI', sans-serif; color: #fff; background: #D97757;
        box-shadow: 0 10px 30px rgba(0,0,0,.22), 0 0 0 1px rgba(0,0,0,.04); transition: transform .15s ease, filter .15s ease; }
      .b:hover { transform: translateY(-1px); filter: brightness(1.05); }
      .b[disabled] { cursor: default; background: #6F9161; }
      .b.busy { opacity: .75; cursor: progress; }
      .dot { width: 18px; height: 18px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fff8, #fff2 70%); }`;
    const b = document.createElement('button'); b.className = 'b';
    const dot = document.createElement('span'); dot.className = 'dot';
    const t = document.createElement('span'); t.className = 't';
    b.append(dot, t); root.append(style, b);
    const set = (installed) => { t.textContent = installed ? 'Added to The Stupid Browser' : 'Add to The Stupid Browser'; b.disabled = !!installed; };
    set(st.installed);
    b.addEventListener('click', async () => {
      if (b.disabled || b.classList.contains('busy')) return;
      b.classList.add('busy'); t.textContent = 'Adding…';
      const name = (document.querySelector('h1') || {}).textContent || '';
      let r = null; try { r = await ipcRenderer.invoke('ext:storeInstall', id, String(name).trim().slice(0, 120)); } catch {}
      b.classList.remove('busy');
      if (r && r.installed) set(true); else { set(false); if (r && r.error) t.textContent = r.error; setTimeout(() => set(false), 3000); }
    });
    document.documentElement.appendChild(host);
  };
  // The store is a single-page app: the URL changes without a reload, so it's looked at now and then (cheap: a regex).
  const kick = () => setTimeout(render, 0);
  addEventListener('popstate', kick);
  setInterval(() => { if (!document.hidden) render(); }, 1500);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', kick); else kick();
}
