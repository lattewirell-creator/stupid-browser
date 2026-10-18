/* The Stupid Browser for Mac: importing bookmarks, history and passwords from other browsers on this
 * Mac or from exported files. Same behaviour as src/import-bookmarks.js and src/import-sources.js
 * (readHtml, parseCsv and parsePlistXml come verbatim via core-gen.js); files and databases are read
 * by the Mac app (host "files" / "sqlite" / "plist"), always from copies, never written to. */
"use strict";

const fsx = (act, path) => host("files", { act, path });
const joinPath = (...p) => p.join("/").replace(/\/+/g, "/");
const macSupport = (p) => joinPath(HOST_INFO.home, "Library/Application Support", p);
const SAFARI_DIR = () => joinPath(HOST_INFO.home, "Library/Safari");
const CHROMIUM_MAC = () => [["chrome", "Google Chrome", macSupport("Google/Chrome")], ["edge", "Microsoft Edge", macSupport("Microsoft Edge")],
  ["brave", "Brave", macSupport("BraveSoftware/Brave-Browser")], ["arc", "Arc", macSupport("Arc/User Data")], ["vivaldi", "Vivaldi", macSupport("Vivaldi")],
  ["opera", "Opera", macSupport("com.operasoftware.Opera")], ["operagx", "Opera GX", macSupport("com.operasoftware.OperaGX")], ["chromium", "Chromium", macSupport("Chromium")]];
const GECKO_MAC = () => [["firefox", "Firefox", macSupport("Firefox")], ["zen", "Zen", macSupport("zen")], ["librewolf", "LibreWolf", macSupport("librewolf")]];
const isFile = (f) => fsx("isFile", f).catch(() => false);
const readJson = async (f) => { try { return JSON.parse(await fsx("read", f)); } catch { return null; } };
const countNodes = (nodes) => nodes.reduce((n, x) => n + (x.children ? countNodes(x.children) : (/^https?:/i.test(x.url) ? 1 : 0)), 0);
const okTs = (ts) => ts > 0 && ts <= Date.now() + 864e5;
const histRow = (url, title, ts) => ({ url: String(url).slice(0, 4000), title: String(title || url).slice(0, 300), ts: Math.round(ts) });
const sql = (path, query, params = []) => host("sqlite", { path, sql: query, params });

/* ---------- Chromium ---------- */
async function readChromium(file) {
  const j = JSON.parse(await fsx("read", file));
  const conv = (n) => (n.type === "folder" ? { title: n.name || "Folder", children: (n.children || []).map(conv) } : { title: n.name || "", url: n.url || "" });
  const r = j.roots || {};
  return { bar: (r.bookmark_bar && r.bookmark_bar.children || []).map(conv), other: [...(r.other && r.other.children || []), ...(r.synced && r.synced.children || [])].map(conv) };
}
async function readChromiumHistory(profileDir, limit = 5000) {
  const src = joinPath(profileDir, "History");
  if (!(await isFile(src))) return [];
  try {
    return (await sql(src, "SELECT url, title, last_visit_time / 1000 AS t FROM urls WHERE hidden = 0 AND url LIKE 'http%' ORDER BY last_visit_time DESC LIMIT ?", [limit]))
      .map((r) => histRow(r.url, r.title, Number(r.t) - 11644473600000)).filter((r) => okTs(r.ts));
  } catch (e) { console.error("history import failed", e.message); return []; }
}
async function chromiumProfiles([bid, bname, root]) {
  const out = [];
  if (await isFile(joinPath(root, "Bookmarks")) || await isFile(joinPath(root, "History"))) out.push({ dir: root, key: ".", profile: "", account: "" });
  const info = (((await readJson(joinPath(root, "Local State"))) || {}).profile || {}).info_cache || {};
  let dirs = Object.keys(info);
  if (!dirs.length) { try { dirs = (await fsx("list", root)).filter((d) => d === "Default" || /^Profile \d+$/.test(d)); } catch {} }
  for (const d of dirs) {
    const dir = joinPath(root, d);
    if (!(await isFile(joinPath(dir, "Bookmarks"))) && !(await isFile(joinPath(dir, "History")))) continue;
    const i = info[d] || {};
    out.push({ dir, key: d, profile: String(i.name || (d === "Default" ? "" : d)), account: String(i.user_name || "") });
  }
  return out.map((p) => ({ ...p, id: `${bid}:${p.key}`, kind: "chromium", browser: bid, name: bname, multi: out.length > 1 }));
}

/* ---------- Firefox ---------- */
async function geckoProfiles([bid, bname, root]) {
  let ini; try { ini = await fsx("read", joinPath(root, "profiles.ini")); } catch { return []; }
  if (!ini) return [];
  const out = []; let cur = null;
  for (const line of ini.split(/\r?\n/)) {
    const sec = line.match(/^\[(.+)\]\s*$/);
    if (sec) { cur = /^Profile\d+$/.test(sec[1]) ? {} : null; if (cur) out.push(cur); continue; }
    const kv = line.match(/^([^=]+)=(.*)$/);
    if (cur && kv) cur[kv[1].trim()] = kv[2].trim();
  }
  const list = [];
  for (const p of out.filter((x) => x.Path)) {
    const dir = p.IsRelative === "0" ? p.Path : joinPath(root, p.Path);
    if (!(await isFile(joinPath(dir, "places.sqlite")))) continue;
    const user = ((await readJson(joinPath(dir, "signedInUser.json"))) || {}).accountData || {};
    list.push({ dir, key: p.Path, id: `${bid}:${p.Path}`, kind: "gecko", browser: bid, name: bname, profile: String(p.Name || ""), account: String(user.email || "") });
  }
  return list.map((p) => ({ ...p, multi: list.length > 1 }));
}
async function readGecko(profileDir) {
  const rows = await sql(joinPath(profileDir, "places.sqlite"), "SELECT b.id, b.type, b.parent, b.title, b.guid, p.url FROM moz_bookmarks b LEFT JOIN moz_places p ON p.id = b.fk ORDER BY b.parent, b.position");
  const kids = new Map();
  for (const r of rows) { if (!kids.has(r.parent)) kids.set(r.parent, []); kids.get(r.parent).push(r); }
  const conv = (r) => (r.type === 2 ? { title: r.title || "Folder", children: (kids.get(r.id) || []).map(conv).filter(Boolean) }
    : r.type === 1 ? { title: r.title || "", url: r.url || "" } : null);
  const root = (guid) => { const r = rows.find((x) => x.guid === guid); return r ? (kids.get(r.id) || []).map(conv).filter(Boolean) : []; };
  return { bar: root("toolbar_____"), other: [...root("unfiled_____"), { title: "Bookmarks Menu", children: root("menu________") }, { title: "Mobile bookmarks", children: root("mobile______") }] };
}
async function readGeckoHistory(profileDir, limit = 5000) {
  try {
    return (await sql(joinPath(profileDir, "places.sqlite"), "SELECT url, title, last_visit_date / 1000 AS t FROM moz_places WHERE hidden = 0 AND last_visit_date IS NOT NULL AND url LIKE 'http%' ORDER BY last_visit_date DESC LIMIT ?", [limit]))
      .map((r) => histRow(r.url, r.title, Number(r.t))).filter((r) => okTs(r.ts));
  } catch (e) { console.error("history import failed", e.message); return []; }
}

/* ---------- Safari (needs Full Disk Access) ---------- */
async function readSafari() {
  const xml = await host("plist", { path: joinPath(SAFARI_DIR(), "Bookmarks.plist") });
  const conv = (n) => (n.WebBookmarkType === "WebBookmarkTypeList" ? { title: n.Title || "Folder", children: (n.Children || []).map(conv).filter(Boolean) }
    : n.WebBookmarkType === "WebBookmarkTypeLeaf" ? { title: (n.URIDictionary && n.URIDictionary.title) || "", url: n.URLString || "" } : null);
  const top = ((parsePlistXml(xml) || {}).Children || []).filter((n) => n.WebBookmarkType === "WebBookmarkTypeList");
  const bar = top.find((n) => n.Title === "BookmarksBar"), menu = top.find((n) => n.Title === "BookmarksMenu"), reading = top.find((n) => n.Title === "com.apple.ReadingList");
  const rest = top.filter((n) => n !== bar && n !== menu && n !== reading).map(conv);
  return { bar: bar ? conv(bar).children : [], other: [...(menu ? conv(menu).children : []), ...rest, ...(reading ? [{ title: "Reading List", children: conv(reading).children }] : [])] };
}
async function readSafariHistory(limit = 5000) {
  try {
    return (await sql(joinPath(SAFARI_DIR(), "History.db"), "SELECT i.url AS url, v.title AS title, MAX(v.visit_time) AS t FROM history_items i JOIN history_visits v ON v.history_item = i.id WHERE i.url LIKE 'http%' GROUP BY i.id ORDER BY t DESC LIMIT ?", [limit]))
      .map((r) => histRow(r.url, r.title, (Number(r.t) + 978307200) * 1000)).filter((r) => okTs(r.ts));
  } catch (e) { console.error("safari history import failed", e.message); return []; }
}

/* ---------- discovery ---------- */
async function discoverBrowsers() {
  const list = [];
  for (const b of CHROMIUM_MAC()) list.push(...await chromiumProfiles(b));
  for (const b of GECKO_MAC()) list.push(...await geckoProfiles(b));
  const access = await fsx("canRead", joinPath(SAFARI_DIR(), "Bookmarks.plist")).catch(() => null);   // null: no Safari bookmarks at all
  if (access !== null) list.push({ id: "safari", kind: "safari", browser: "safari", name: "Safari", profile: "", account: "", dir: SAFARI_DIR(), needsAccess: !access });
  return list;
}
async function readBookmarksOf(src) {
  if (src.kind === "chromium") return (await isFile(joinPath(src.dir, "Bookmarks"))) ? readChromium(joinPath(src.dir, "Bookmarks")) : { bar: [], other: [] };
  if (src.kind === "gecko") return readGecko(src.dir);
  return readSafari();
}
function readHistoryOf(src) {
  if (src.kind === "chromium") return readChromiumHistory(src.dir);
  if (src.kind === "gecko") return readGeckoHistory(src.dir);
  return readSafariHistory();
}
const hasHistory = (src) => isFile(joinPath(src.dir, src.kind === "chromium" ? "History" : src.kind === "gecko" ? "places.sqlite" : "History.db"));
async function summary(src) {
  let n = 0;
  if (!src.needsAccess) { try { const t = await readBookmarksOf(src); n = countNodes(t.bar) + countNodes(t.other); } catch {} }
  return { id: src.id, browser: src.browser, name: src.name, profile: src.multi ? src.profile : "", account: src.account, count: n, history: !src.needsAccess && await hasHistory(src), needsAccess: !!src.needsAccess };
}
const labelOf = (src) => src.name + ((src.account || (src.multi && src.profile)) ? ` (${src.account || src.profile})` : "");

/* ---------- adding what was read ---------- */
function addHistoryRows(rows) {
  if (!rows.length) return 0;
  const h = getHistory().slice();
  const seen = new Set(h.map((x) => x.url + "|" + Math.round(x.ts / 60000)));
  let n = 0;
  for (const r of rows) {
    const k = r.url + "|" + Math.round(r.ts / 60000); if (seen.has(k)) continue; seen.add(k);
    h.push({ id: r.ts.toString(36) + Math.random().toString(36).slice(2, 6), url: r.url, title: r.title, ts: r.ts }); n++;
  }
  h.sort((a, b) => a.ts - b.ts); if (h.length > 20000) h.splice(0, h.length - 20000);
  store.write("history.json", h); return n;
}
function addTree(tree, label) {
  const all = getBookmarks().slice();
  const known = new Set(all.filter((b) => b.type === "bookmark").map((b) => b.url));
  const fresh = !all.length;
  let seq = 0, added = 0;
  const id = () => "i" + Date.now().toString(36) + (seq++).toString(36);
  const put = (nodes, parentId) => {
    for (const n of nodes) {
      if (all.length > 20000) return;
      if (n.children) {
        const f = { id: id(), type: "folder", title: String(n.title).slice(0, 200), parentId, ts: Date.now() };
        all.push(f); put(n.children, f.id);
        if (!all.some((b) => b.parentId === f.id)) all.splice(all.indexOf(f), 1);   // drop empty folders
      } else if (/^https?:\/\//i.test(n.url) && !known.has(n.url)) {
        known.add(n.url); added++;
        all.push({ id: id(), type: "bookmark", title: String(n.title || n.url).slice(0, 300), url: n.url.slice(0, 4000), favicon: null, parentId, ts: Date.now() });
      }
    }
  };
  // New users get the other browser's bar as their bar; otherwise it goes into its own folder.
  let barParent = null, otherParent;
  if (!fresh) { const f = { id: id(), type: "folder", title: `Imported from ${label}`, parentId: null, ts: Date.now() }; all.push(f); barParent = f.id; }
  put(tree.bar, barParent);
  if (tree.other.length) { const f = { id: id(), type: "folder", title: "Other bookmarks", parentId: barParent, ts: Date.now() }; all.push(f); otherParent = f.id; put(tree.other, otherParent); if (!all.some((b) => b.parentId === f.id)) all.splice(all.indexOf(f), 1); }
  if (!fresh && !all.some((b) => b.parentId === barParent)) all.splice(all.findIndex((b) => b.id === barParent), 1);
  store.write("bookmarks.json", all); broadcast("bookmarks:changed", all);
  return { ok: true, added };
}

handle("import:sources", ["internal"], async () => (await Promise.all((await discoverBrowsers()).map(summary))).filter((s) => s.needsAccess || s.count > 0 || s.history));
handle("import:browser", ["internal"], async (_e, id, what) => {
  const s = (await discoverBrowsers()).find((x) => x.id === id);
  if (!s) return { ok: false, error: "Couldn’t find that browser on this computer any more." };
  if (s.needsAccess) return { ok: false, error: "macOS hasn’t given The Stupid Browser access to Safari yet." };
  const want = { bookmarks: true, history: true, ...(what && typeof what === "object" ? what : {}) };
  let res = { ok: true, added: 0 };
  if (want.bookmarks) {
    try { res = addTree(await readBookmarksOf(s), labelOf(s)); } catch (e) { console.error("bookmark import failed", e.message); return { ok: false, error: "Couldn’t read those bookmarks. If that browser is open, quit it and try again." }; }
  }
  res.history = want.history ? addHistoryRows(await readHistoryOf(s)) : 0;
  return res;
});
// Safari: open System Settings → Privacy & Security → Full Disk Access.
handle("import:safariAccess", ["internal"], () => host("openPrivacy", {}).then(() => true, () => false));
handle("import:file", ["internal"], async () => {
  const f = await host("openFile", { title: "Import bookmarks", button: "Import", exts: ["html", "htm"], max: 50e6 });
  if (!f) return { ok: false, error: "canceled" };
  if (f.error || !/<DL>/i.test(f.text || "")) return { ok: false, error: f.error || "That isn’t a bookmarks file." };
  return addTree(readHtml(f.text), String(f.name).replace(/\.html?$/i, ""));
});
// Passwords from a browser's CSV export; encrypted immediately like any saved password.
handle("import:passwords", ["internal"], async () => {
  const f = await host("openFile", { title: "Import passwords", button: "Import", exts: ["csv"], max: 20e6 });
  if (!f) return { ok: false, error: "canceled" };
  if (f.error) return { ok: false, error: "Couldn’t read that file." };
  const rows = parseCsv(f.text.replace(/^﻿/, ""));
  const head = (rows.shift() || []).map((x) => x.trim().toLowerCase());
  const col = (...names) => head.findIndex((h) => names.includes(h));
  const iu = col("url", "website", "login_uri", "origin"), iuser = col("username", "login", "login_username", "user name"), ipw = col("password", "login_password");
  if (iu < 0 || ipw < 0) return { ok: false, error: "That doesn’t look like a passwords export (it needs url and password columns)." };
  const list = getPasswords().slice();
  let added = 0, skipped = 0;
  for (const row of rows) {
    let origin; try { const u = new URL((row[iu] || "").trim()); if (!/^https?:$/.test(u.protocol)) throw 0; origin = u.origin; } catch { skipped++; continue; }
    const username = String(iuser >= 0 ? row[iuser] || "" : "").slice(0, 300), password = String(row[ipw] || "").slice(0, 1000);
    if (!password) { skipped++; continue; }
    if (list.some((p) => p.origin === origin && !p.never && p.username === username)) { skipped++; continue; }
    list.push({ id: "p" + Date.now().toString(36) + added.toString(36), origin, username, password: await enc(password), created: Date.now() }); added++;
  }
  store.write("passwords.json", list); broadcast("passwords:changed", true);
  return { ok: true, added, skipped, file: f.name };
});
