/* The Stupid Browser for Mac: downloads, passwords, site permissions, clearing data, profiles, default
 * browser, app name/icon and updates. Same channels and data files as the Electron main process
 * (src/main.js); the native parts (files, Keychain, dialogs) are done by the Mac app through host(). */
"use strict";

/* ---------------- downloads ---------------- */
// The Mac app runs the downloads (WKDownload) and reports them here; the list lives in downloads.json.
handle("dl:event", [], (ctx, ev) => {
  if (!ev || typeof ev !== "object") return false;
  if (ev.kind === "start") {
    const r = ev.rec || {};
    const rec = { id: String(r.id), filename: String(r.filename || "download"), url: String(r.url || ""), savePath: String(r.savePath || ""), state: "progressing",
      received: 0, total: +r.total || 0, ts: Date.now(), incognito: !!ctx.incognito, paused: false };
    const list = getDownloads(); list.unshift(rec); store.write("downloads.json", ctx.incognito ? list : list.slice(0, 500));
    if (ctx.window) sendToWindow(ctx.window, "downloads:started", Object.assign({}, rec));
    return true;
  }
  if (ev.kind === "update") {
    const list = getDownloads(), rec = list.find((d) => d.id === String(ev.id));
    if (!rec) return false;
    const p = ev.patch || {};
    for (const k of ["state", "received", "total", "paused", "savePath", "filename"]) if (k in p) rec[k] = p[k];
    store.write("downloads.json", list, p.state && p.state !== "progressing" ? 300 : 1000);
    broadcast("downloads:update", Object.assign({}, rec));
    return true;
  }
  return false;
});
handle("downloads:action", ANY, async (_e, id, action) => {
  const rec = getDownloads().find((d) => d.id === id);
  switch (action) {
    case "open": if (rec) return host("download", { act: "open", path: rec.savePath }); break;
    case "show": if (rec) await host("download", { act: "show", path: rec.savePath }); break;
    case "cancel": case "pause": case "resume": await host("download", { act: action, id }); break;
    case "retry": if (rec) await host("download", { act: "start", url: rec.url }); break;
    case "remove": store.write("downloads.json", getDownloads().filter((d) => d.id !== id)); broadcast("downloads:removed", id); break;
  }
  return true;
});
handle("downloads:chooseDir", ["internal"], async () => {
  const dir = await host("chooseFolder", { path: getSettings().downloadDir });
  if (!dir) return null;
  setSettings({ downloadDir: dir });
  return dir;
});

/* ---------------- passwords (encrypted with a key kept in the macOS Keychain) ---------------- */
const enc = (s) => host("crypt", { act: "enc", text: String(s) });
const dec = (s) => host("crypt", { act: "dec", text: String(s || "") }).then((t) => t || "", () => "");
const pendingPwSaves = new Map();
let pwSeq = 0;
handle("pw:respond", ["shell"], async (_e, id, action) => {
  const p = pendingPwSaves.get(id); pendingPwSaves.delete(id);
  if (!p) return;
  const list = getPasswords();
  if (action === "never") { list.push({ id: "n" + Date.now(), origin: p.origin, never: true }); store.write("passwords.json", list); return; }
  if (action !== "save") return;
  const secret = await enc(p.password);
  const existing = list.find((x) => x.origin === p.origin && !x.never && x.username === p.username);
  if (existing) { existing.password = secret; existing.updated = Date.now(); }
  else list.push({ id: "p" + Date.now().toString(36), origin: p.origin, username: p.username, password: secret, created: Date.now() });
  store.write("passwords.json", list); broadcast("passwords:changed", true);
});
handle("pw:reveal", ["internal"], async (_e, id) => { const x = getPasswords().find((p) => p.id === id); return x && !x.never ? dec(x.password) : ""; });
// From the password helper in web pages: ctx.origin is the frame's own origin (checked by the Mac app).
handle("pw:query", [], async (ctx) => {
  if (!getSettings().savePasswords || ctx.incognito || !/^https?:/.test(ctx.origin || "")) return [];
  const mine = getPasswords().filter((p) => p.origin === ctx.origin && !p.never);
  return Promise.all(mine.map(async (p) => ({ username: p.username, password: await dec(p.password) })));
});
handle("pw:submitted", [], async (ctx, data) => {
  if (!data || !getSettings().savePasswords || ctx.incognito || !ctx.window) return;
  const origin = ctx.origin || "";
  if (!/^https?:/.test(origin)) return;
  const username = String(data.username || "").slice(0, 300), password = String(data.password || "").slice(0, 1000);
  if (!password) return;
  const list = getPasswords();
  if (list.some((p) => p.origin === origin && p.never)) return;
  const same = list.find((p) => p.origin === origin && !p.never && p.username === username);
  if (same && (await dec(same.password)) === password) return;
  const id = ++pwSeq;
  pendingPwSaves.set(id, { origin, username, password });
  sendToWindow(ctx.window, "pw:offer", { id, origin, username, update: !!same });
});

/* ---------------- site permissions ---------------- */
let permReqSeq = 0;
const pendingPerms = new Map();
// From the Mac app when a page asks for the camera, microphone or location: resolves to true/false.
handle("perm:request", [], (ctx, origin, kinds) => {
  kinds = (Array.isArray(kinds) ? kinds : []).filter((k) => PERM_KINDS.includes(k));
  if (!kinds.length || !/^https?:\/\//.test(String(origin || ""))) return false;
  const site = getSitePerms()[origin] || {};
  if (kinds.some((k) => site[k] === "block")) return false;
  if (kinds.every((k) => site[k] === "allow")) return true;
  if (!ctx.window) return false;
  const id = ++permReqSeq;
  return new Promise((resolve) => {
    pendingPerms.set(id, { callback: resolve, origin, kinds, incognito: !!ctx.incognito });
    sendToWindow(ctx.window, "perm:prompt", { id, origin, kinds, wcId: ctx.tab || 0 });
  });
});
function resolvePerm(id, allow, remember) {
  const p = pendingPerms.get(id);
  if (!p) return;
  pendingPerms.delete(id);
  if (remember && !p.incognito) {
    const all = getSitePerms();
    all[p.origin] = all[p.origin] || {};
    for (const k of p.kinds) all[p.origin][k] = allow ? "allow" : "block";
    store.write("site-permissions.json", all);
    broadcast("perms:changed", all);
  }
  try { p.callback(!!allow); } catch {}
}
handle("perm:respond", ["shell"], (_e, id, allow, remember) => resolvePerm(id, allow, remember));

/* ---------------- clearing data ---------------- */
handle("site:clearData", ["shell"], async (ctx, origin) => { await host("clearData", { origin: String(origin || ""), incognito: !!ctx.incognito, window: ctx.window }); return true; });
handle("privacy:clear", ["internal"], async (_e, { range, history, cookies, cache, downloads } = {}) => {
  const since = range > 0 ? Date.now() - range : 0;
  if (history) store.write("history.json", getHistory().filter((x) => x.ts < since));
  if (downloads) store.write("downloads.json", getDownloads().filter((x) => x.state === "progressing" || x.ts < since));
  if (cookies || cache) await host("clearData", { cookies: !!cookies, cache: !!cache, since });
  return true;
});

/* ---------------- profiles (each has its own data folder and runs as its own app) ---------------- */
handle("profiles:list", ["shell"], () => host("profiles", { act: "list" }));
handle("profiles:picker", ["internal"], (_e, on) => host("profiles", on === undefined ? { act: "picker" } : { act: "setPicker", on: !!on }));
handle("profiles:open", ["shell"], (_e, id) => host("profiles", { act: "open", id: String(id) }));
handle("profiles:create", ["shell"], async (_e, p) => { const made = await host("profiles", { act: "create", name: String((p && p.name) || ""), color: String((p && p.color) || "") }); if (made) await host("profiles", { act: "open", id: made.id }); return made; });
handle("profiles:remove", ["shell"], (_e, id) => host("profiles", { act: "remove", id: String(id) }));

/* ---------------- default browser, app name and icon ---------------- */
handle("default:status", ["internal"], async () => Object.assign(await host("defaultBrowser", { act: "status" }), { platform: "darwin" }));
handle("default:set", ["internal"], () => host("defaultBrowser", { act: "set" }));
handle("brand:status", ["internal"], () => host("brand", { act: "status" }));
handle("brand:apply", ["internal"], async (_e, reset) => {
  const s = getSettings();
  await host("brand", reset ? { act: "apply", name: "The Stupid Browser", icon: "" } : { act: "apply", name: s.wordmark || "The Stupid Browser", icon: s.appIcon && s.appIconImage ? s.appIconImage : "" });
  setSettings({ brandBundle: !reset });
  store.flushAll();
  setTimeout(() => host("quit", {}).catch(() => {}), 150);
  return true;
});

/* ---------------- updates (the Mac app checks GitHub Releases) ---------------- */
const updateState = { status: "idle", version: null, progress: 0, error: null, lastCheck: null, current: "", portable: false, packaged: true };
handle("update:push", [], (_ctx, patch) => { Object.assign(updateState, patch || {}); broadcast("update:status", Object.assign({}, updateState)); return true; });
handle("update:status", ANY, () => Object.assign({}, updateState, { current: HOST_INFO.version }));
handle("update:check", ANY, async () => { await host("update", { act: "check" }).catch(() => {}); return Object.assign({}, updateState, { current: HOST_INFO.version }); });
handle("update:install", ANY, async () => { if (updateState.status !== "ready") return false; store.flushAll(); return host("update", { act: "install" }); });

/* ---------------- menus the UI asks for ---------------- */
handle("bookmarks:folderMenu", ["shell"], (ctx, folderId, x, y) => {
  const all = getBookmarks();
  const build = (pid, depth) => {
    const items = depth > 12 ? [] : all.filter((b) => b.parentId === pid).map((b) => b.type === "folder"
      ? { label: b.title || "Folder", submenu: build(b.id, depth + 1) }
      : { label: (b.title || b.url).slice(0, 60), emit: ["open-url", { url: b.url, where: "current" }] });
    return items.length ? items : [{ label: "(empty)", enabled: false }];
  };
  return host("popupMenu", { window: ctx.window, x: +x || 0, y: +y || 0, items: build(folderId, 0) });
});
handle("shell:editMenu", ["shell"], (ctx, info) => host("editMenu", { window: ctx.window, go: !!(info && info.go), hasSelection: !!(info && info.hasSelection) }));
