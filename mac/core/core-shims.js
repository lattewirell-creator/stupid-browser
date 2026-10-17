/* The Stupid Browser for Mac: Electron stand-ins for the code in core-gen.js (copied verbatim from
 * src/main.js). Loaded first: store (JSON files in the data folder, cached like the Electron app's
 * store.js), handle() (IPC handlers), broadcast() (events to windows and pages), ANY. */
"use strict";

const ANY = ["shell", "internal"];
const HANDLERS = new Map();
/** Same signature as the Electron main process: handle(channel, who, (event, ...args) => value). */
function handle(channel, _who, fn) { HANDLERS.set(channel, fn); }

// Messages to the Mac app
const post = (m) => window.webkit.messageHandlers.core.postMessage(m);
addEventListener("error", (e) => post({ type: "log", text: `${e.message} (${(e.filename || "").split("/").pop()}:${e.lineno})` }));
let hostSeq = 0;
const hostWaiting = new Map();
function host(op, data = {}) {
  return new Promise((resolve, reject) => { const id = ++hostSeq; hostWaiting.set(id, { resolve, reject }); post(Object.assign({ type: "host", id, op }, data)); });
}
/** Event to every window (and our pages), or to one window with { window: id }. */
function broadcast(channel, ...args) { post({ type: "emit", channel, args }); }
function sendToWindow(windowId, channel, ...args) { post({ type: "emit", channel, args, window: windowId }); }

// JSON files, read once at startup and kept in memory; writes are batched like src/store.js.
const store = (() => {
  const cache = new Map(), timers = new Map();
  return {
    async preload(names) { for (const n of names) { try { const t = await host("read", { name: n }); if (t) cache.set(n, JSON.parse(t)); } catch (e) { console.error("store: could not read", n, e); } } },
    read(name, fallback) { return cache.has(name) ? cache.get(name) : fallback; },
    write(name, data, delay = 300) {
      cache.set(name, data);
      clearTimeout(timers.get(name));
      timers.set(name, setTimeout(() => { timers.delete(name); host("write", { name, text: JSON.stringify(data) }).catch((e) => console.error("store: could not save", name, e)); }, delay));
    },
    flushAll() { for (const [name, t] of timers) { clearTimeout(t); timers.delete(name); host("write", { name, text: JSON.stringify(cache.get(name)) }); } },
  };
})();
const FILES = ["settings.json", "bookmarks.json", "ai-bots.json", "sidebar.json", "launcher.json", "history.json", "site-permissions.json",
  "passwords.json", "downloads.json", "background.json", "widgets.json", "sessions.json", "rewind.json"];

// Things main.js code reaches for that live elsewhere on the Mac.
let blockedCount = 0;
const profiles = { sync() {} };
/** Settings that change the app itself (theme, Shield, app icon…): the Mac app applies them. */
function applySettingsSideEffects(patch) {
  const keep = {};
  for (const k of ["theme", "adblock", "appIcon", "appIconImage", "wordmark", "eq", "glass"]) if (k in patch) keep[k] = patch[k];
  if (Object.keys(keep).length) host("settingsApplied", { patch: keep, settings: getSettings() }).catch(() => {});
}
