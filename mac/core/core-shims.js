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
const hostStreams = new Map();   // host id -> onChunk (streamed answers, e.g. Buddy's replies)
function host(op, data = {}, onChunk = null) {
  return new Promise((resolve, reject) => {
    const id = ++hostSeq;
    hostWaiting.set(id, { resolve, reject });
    if (onChunk) hostStreams.set(id, onChunk);
    post(Object.assign({ type: "host", id, op }, data));
  });
}
/** HTTP request done by the Mac app (no CORS limits, like Node's fetch in the Electron main process).
 *  Returns { status, body } (body: the whole text when not streamed). onChunk gets text as it arrives.
 *  Pass an AbortController's signal to cancel. */
function nativeFetch(url, { method = "GET", headers = {}, body = null, timeout = 0, signal = null } = {}, onChunk = null) {
  const fid = "f" + (++hostSeq) + Math.random().toString(36).slice(2, 6);
  if (signal) { if (signal.aborted) return Promise.reject(new Error("aborted")); signal.addEventListener("abort", () => host("fetchAbort", { fid }).catch(() => {}), { once: true }); }
  return host("fetch", { fid, url, method, headers, body, timeout, stream: !!onChunk }, onChunk);
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
const profiles = { sync(s) { host("profiles", { op: "sync", name: s.name || "", color: s.profileColor || "clay", email: s.email || "" }).catch(() => {}); } };
// The settings the Mac app itself needs (menus, downloads, page helpers…), without the big images.
const NATIVE_KEYS = ["theme", "adblock", "appIcon", "wordmark", "eq", "glass", "search", "customSearch", "savePasswords", "downloadDir", "askWhereToSave",
  "fontSize", "dnt", "brandBundle", "name", "profileColor", "musicIsland"];
/** Settings that change the app itself (theme, Shield, app icon…): the Mac app applies them. */
function applySettingsSideEffects(patch) {
  const s = getSettings(), slim = {};
  for (const k of NATIVE_KEYS) slim[k] = s[k];
  slim.searchUrl = searchUrlFor(s);
  slim.engineName = s.search === "custom" ? "the web" : (SEARCH_ENGINES[s.search] || SEARCH_ENGINES.google).name;
  const icon = "appIcon" in patch || "appIconImage" in patch ? { appIconImage: s.appIcon ? s.appIconImage || "" : "" } : {};
  host("settingsApplied", Object.assign({ changed: Object.keys(patch), settings: slim }, icon)).catch(() => {});
}
