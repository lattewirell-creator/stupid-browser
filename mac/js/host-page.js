/* The Stupid Browser for Mac: window.stupid for our own pages (stupid://settings, welcome, …), like the
 * Electron app's internal-preload.js. Only injected into stupid:// pages; the app checks the origin too. */
(() => {
  "use strict";
  if (location.protocol !== "stupid:") return;
  const post = (m) => window.webkit.messageHandlers.page.postMessage(m);
  addEventListener("error", (e) => post({ log: `${location.host}: ${e.message} (${(e.filename || "").split("/").pop()}:${e.lineno})` }));
  addEventListener("unhandledrejection", (e) => post({ log: `${location.host}: unhandled ${e.reason && e.reason.message || e.reason}` }));
  let seq = 0;
  const pending = new Map(), listeners = new Map();
  window.stupid = Object.freeze({
    platform: "darwin",
    engine: "webkit",
    invoke: (channel, ...args) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); post({ id, channel, args }); }),
    on: (channel, fn) => { (listeners.get(channel) || listeners.set(channel, []).get(channel)).push(fn); },
  });
  window.__stupidPage = {
    reply(id, ok, value) { const p = pending.get(id); if (!p) return; pending.delete(id); ok ? p.resolve(value) : p.reject(new Error(value)); },
    emit(channel, args) { for (const fn of listeners.get(channel) || []) { try { fn(...args); } catch (e) { console.error(e); } } },
  };
})();
