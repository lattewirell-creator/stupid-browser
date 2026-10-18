/* The Stupid Browser for Mac: the core (like Electron's main process). Most handlers come verbatim
 * from src/main.js via core-gen.js; this file adds the ones that are different on a Mac, the call
 * dispatcher, and startup. */
"use strict";

let firstRun = false;
let startQueue = [];          // windows still to open at startup: { restore, urls }
const sessions = new Map();   // window id -> { tabs, groups, active }

/* ---------------- windows, sessions, history ---------------- */
// Which windows to open at startup (like the Electron app's openStartupWindows): the welcome screen on a
// first run, else every saved window ("continue where you left off"), the startup pages, or a new tab.
handle("app:startup", [], (_ctx, extra) => {
  extra = (Array.isArray(extra) ? extra : []).map(String);
  const s = getSettings(), saved = store.read("session.json", []);
  if (firstRun) { firstRun = false; startQueue = [{ urls: ["stupid://welcome/", ...extra] }]; }
  else if (s.startup === "continue" && saved.length) startQueue = saved.map((sess, i) => ({ restore: sess, urls: i === 0 && extra.length ? extra : null }));
  else if (s.startup === "pages" && (s.startupPages || []).length) startQueue = [{ urls: [...s.startupPages, ...extra] }];
  else startQueue = [{ urls: extra.length ? extra : null }];
  sessions.clear();
  return startQueue.length;
});
handle("win:info", [], (ctx) => {
  const info = { incognito: !!ctx.incognito, partition: ctx.incognito ? "incognito" : "persist:main", ai: "persist:ai", apps: "persist:apps", restore: null, urls: ctx.urls || null, version: HOST_INFO.version };
  if (!ctx.incognito && ctx.startup && startQueue.length) { const q = startQueue.shift(); info.restore = q.restore || null; info.urls = q.urls || info.urls; }
  return info;
});
handle("session:save", [], (ctx, data) => {
  if (ctx.incognito || !data) return;
  sessions.set(ctx.window, { tabs: (data.tabs || []).slice(0, 200), groups: (data.groups || []).slice(0, 50), active: data.active | 0 });
  store.write("session.json", [...sessions.values()].filter((x) => x.tabs && x.tabs.length), 200);
});
handle("win:closed", [], (ctx) => {
  const chat = buddyChats.get(ctx.window); if (chat && chat.controller) chat.controller.abort(); buddyChats.delete(ctx.window);
  // Keep the last window's tabs for "continue where you left off"; forget other closed windows.
  if (sessions.size > 1) { sessions.delete(ctx.window); store.write("session.json", [...sessions.values()], 200); }
});
// From the Mac app when a tab navigates (the Electron main process watched webContents for this).
handle("history:visit", [], (ctx, url, title) => { if (!ctx.incognito) addHistory(String(url || ""), String(title || "")); });
handle("history:title", [], (ctx, url, title) => { if (!ctx.incognito) titleHistory(String(url || ""), String(title || "")); });

/* ---------------- small things ---------------- */
handle("clipboard:write", [], (_e, text) => host("clipboard", { text: String(text || "").slice(0, 10000) }));
handle("about:info", [], () => ({ version: HOST_INFO.version, electron: "—", chrome: "WebKit (Safari " + HOST_INFO.safari + ")", node: "—", platform: HOST_INFO.os, userData: HOST_INFO.dataDir }));
handle("pw:encryption", [], () => true);
// Equalizer curve for the media helper in web pages (the Electron version answers this from main.js too).
handle("eq:get", [], () => cleanEq(getSettings().eq));
// Shield also hides the ads search engines put in their own results (the Mac app inserts this CSS).
handle("ads:css", [], (_ctx, url) => (getSettings().adblock ? searchAdCss(String(url || "")) : ""));
// Blocked requests counted by the Mac app's content blocker.
handle("ads:count", [], (_ctx, n) => { blockedCount = +n || 0; broadcast("adblock:count", blockedCount); return true; });

/* ---------------- dispatcher ---------------- */
const __core = {
  async invoke(id, channel, args, ctx) {
    const fn = HANDLERS.get(channel);
    if (!fn) { post({ type: "reply", id, ok: false, value: `"${channel}" isn't in the Mac version yet` }); return; }
    try {
      const value = await fn(ctx || {}, ...(Array.isArray(args) ? args : []));
      post({ type: "reply", id, ok: true, value: value === undefined ? null : JSON.parse(JSON.stringify(value)) });
    } catch (e) {
      console.error(channel, e);
      post({ type: "reply", id, ok: false, value: String(e && e.message || e) });
    }
  },
  hostReply(id, ok, value) { hostStreams.delete(id); const w = hostWaiting.get(id); if (!w) return; hostWaiting.delete(id); ok ? w.resolve(value) : w.reject(new Error(value)); },
  hostChunk(id, text) { const fn = hostStreams.get(id); if (fn) { try { fn(text); } catch (e) { console.error(e); } } },
};
window.__core = __core;

/* ---------------- startup ---------------- */
(async () => {
  const hi = await host("info");
  Object.assign(HOST_INFO, { version: hi.version, safari: hi.safari, dataDir: hi.dataDir, os: hi.os, home: hi.home, downloads: hi.home + "/Downloads" });
  firstRun = !(await host("read", { name: "settings.json" }));
  await store.preload([...FILES, "session.json", "buddy-key.json"]);
  // Buddy looks saved before the hiker existed: switch to the hiker once (same as the Electron app).
  const saved = store.read("settings.json", {});
  if (saved.buddyLook && typeof saved.buddyLook === "object" && saved.buddyLook.v !== 2) setSettings({ buddyLook: Object.assign({}, saved.buddyLook, { shape: "hiker", v: 2 }) });
  if (firstRun) setSettings({ onboarded: false });   // also makes the next launch not a first run
  applySettingsSideEffects(getSettings());
  post({ type: "ready", firstRun });
})();
