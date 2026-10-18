package com.emil.stupidbrowser;

import android.annotation.SuppressLint;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.CharsetDecoder;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** The core (mac/core: the Electron main process's logic, shared with the Mac app) in a hidden web view.
 *  Windows and pages call it with invoke(channel, args); it answers, broadcasts events, and asks for native
 *  things with "host" messages (port of mac/Sources/Core.swift). */
final class Core {
    interface Reply { void done(boolean ok, Object value); }
    final MainActivity app;
    final WebView web;
    final File dataDir;
    private Runnable ready;
    private int seq = 0;
    private final Map<Integer, Reply> waiting = new HashMap<>();
    private final Map<String, HttpURLConnection> fetches = new ConcurrentHashMap<>();
    private final ExecutorService work = Executors.newCachedThreadPool();
    private final Handler main = new Handler(Looper.getMainLooper());
    JSONObject settings = new JSONObject();

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    Core(MainActivity app) {
        this.app = app;
        dataDir = new File(app.getFilesDir(), "data");
        dataDir.mkdirs();
        web = new WebView(app);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.addJavascriptInterface(this, "StupidCoreNative");
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                WebResourceResponse res = Assets.serve(app, r.getUrl(), dataDir);
                return res != null ? res : Assets.missing();   // the core never loads anything from the internet itself
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return true; }
        });
    }
    void start(Runnable done) { ready = done; web.loadUrl(Assets.CORE + "/core.html"); }

    /** Call a core channel. ctx: { window, incognito, page? } (who is asking). */
    void invoke(String channel, Object args, JSONObject ctx, Reply reply) {
        int id = ++seq;
        if (reply != null) waiting.put(id, reply);
        run("__core.invoke(" + id + "," + JSONObject.quote(channel) + "," + json(args) + "," + ctx + ")");
    }
    void run(String js) { web.evaluateJavascript(js, null); }

    @JavascriptInterface
    public void post(String body) {
        main.post(() -> {
            String url = web.getUrl();
            if (url == null || !url.startsWith(Assets.CORE + "/")) return;
            try { message(new JSONObject(body)); } catch (JSONException ignored) { }
        });
    }

    private void message(JSONObject m) {
        switch (m.optString("type")) {
            case "log": android.util.Log.i("stupid-core", m.optString("text")); break;
            case "ready": if (ready != null) { Runnable r = ready; ready = null; r.run(); } break;
            case "reply": { Reply r = waiting.remove(m.optInt("id")); if (r != null) r.done(m.optBoolean("ok"), m.opt("value")); break; }
            case "emit": {
                String channel = m.optString("channel"); JSONArray args = m.optJSONArray("args"); if (args == null) args = new JSONArray();
                if (m.has("window")) { Win w = app.window(m.optInt("window")); if (w != null) w.emit(channel, args); }
                else for (Win w : app.windows) { w.emit(channel, args); w.tabs.emitToPages(channel, args); }
                break;
            }
            case "host": {
                int id = m.optInt("id");
                host(m, (ok, v) -> run("__core.hostReply(" + id + "," + ok + "," + json(v) + ")"));
                break;
            }
            default:
        }
    }

    /* ---------------- native things the core can't do itself ---------------- */
    private File dataFile(String name) { return name.matches("^[a-zA-Z0-9._-]{1,80}$") ? new File(dataDir, name) : null; }

    private void host(JSONObject m, Reply done) {
        String op = m.optString("op");
        try {
            switch (op) {
                case "read": {
                    File f = dataFile(m.optString("name")); if (f == null) { done.done(false, "bad name"); return; }
                    done.done(true, f.exists() ? new String(java.nio.file.Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8) : null);
                    return;
                }
                case "write": {
                    File f = dataFile(m.optString("name")); if (f == null || !m.has("text")) { done.done(false, "bad name"); return; }
                    String text = m.optString("text");
                    work.execute(() -> {
                        boolean ok = false;
                        try { File tmp = new File(f.getPath() + ".tmp"); try (FileOutputStream o = new FileOutputStream(tmp)) { o.write(text.getBytes(StandardCharsets.UTF_8)); o.getFD().sync(); } ok = tmp.renameTo(f); } catch (Exception ignored) { }
                        boolean r = ok; main.post(() -> done.done(r, r ? Boolean.TRUE : "could not save"));
                    });
                    return;
                }
                case "remove": { File f = dataFile(m.optString("name")); if (f != null) f.delete(); done.done(true, true); return; }
                case "openWindow": {
                    JSONArray urls = m.optJSONArray("urls");
                    app.openWindow(m.optBoolean("incognito"), urls == null ? null : Win.strings(urls)); done.done(true, true); return;
                }
                case "closeWindow": { Win w = app.window(m.optInt("window")); if (w != null) app.closeWindow(w); done.done(true, true); return; }
                case "clipboard": {
                    ((ClipboardManager) app.getSystemService(Context.CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("text", m.optString("text")));
                    done.done(true, true); return;
                }
                case "openExternal": {
                    Uri u = Uri.parse(m.optString("url"));
                    if (u.getScheme() != null && (u.getScheme().equals("http") || u.getScheme().equals("https") || u.getScheme().equals("mailto"))) app.openExternal(u);
                    done.done(true, true); return;
                }
                case "info": {
                    android.content.pm.PackageInfo wv = WebView.getCurrentWebViewPackage();
                    done.done(true, new JSONObject().put("version", BuildConfigLite.version(app)).put("safari", wv == null ? "?" : wv.versionName)
                        .put("dataDir", dataDir.getPath()).put("os", "Android " + Build.VERSION.RELEASE).put("home", app.getFilesDir().getPath()).put("profile", "default"));
                    return;
                }
                case "quit": done.done(true, true); app.finishAndRemoveTask(); return;
                case "settingsApplied": {
                    JSONObject s = m.optJSONObject("settings"); if (s != null) settings = s;
                    app.applySettings(settings, m.optJSONArray("changed"));
                    done.done(true, true); return;
                }
                case "crypt": {
                    String text = m.optString("text");
                    if (m.optString("act").equals("enc")) done.done(true, Vault.enc(text)); else done.done(true, Vault.dec(text));
                    return;
                }
                case "fetch": fetch(m, done); return;
                case "fetchAbort": { HttpURLConnection c = fetches.remove(m.optString("fid")); if (c != null) work.execute(c::disconnect); done.done(true, true); return; }
                // Other browsers' files can't be read on Android (each app's data is private).
                case "files": case "sqlite": case "plist": done.done(true, null); return;
                case "openFile": app.pickTextFile(m, done); return;
                case "chooseFolder": case "openPrivacy": done.done(true, null); return;
                case "download": app.downloads.op(m, done); return;
                case "tabInfo": {
                    Tabs.Tab t = tabOf(m); if (t == null) { done.done(true, null); return; }
                    done.done(true, new JSONObject().put("url", Assets.toUi(t.web.getUrl())).put("title", t.web.getTitle() == null ? "" : t.web.getTitle()));
                    return;
                }
                case "tabEval": { Tabs.Tab t = tabOf(m); Win w = app.window(m.optInt("window")); if (t == null || w == null) { done.done(false, "no tab"); return; } w.tabs.evalHelper(t, m.optString("code"), done); return; }
                case "tabShot": { Tabs.Tab t = tabOf(m); Win w = app.window(m.optInt("window")); if (t == null || w == null) { done.done(false, "no tab"); return; } w.tabs.shot(t, m, new File(dataDir, "rewind"), done); return; }
                case "rewindFiles": done.done(true, rewindFiles(m)); return;
                case "popupMenu": { Win w = app.window(m.optInt("window")); if (w != null) w.js("window.__androidPopup && __androidPopup(" + m.optJSONArray("items") + "," + m.optDouble("x", 0) + "," + m.optDouble("y", 0) + ")"); done.done(true, true); return; }
                case "editMenu": done.done(true, true); return;   // Android shows its own text selection menu
                case "clearData": clearData(m, done); return;
                case "profiles": profiles(m, done); return;
                case "defaultBrowser": {
                    if (m.optString("act").equals("set")) { app.askDefaultBrowser(); done.done(true, true); }
                    else { boolean d = app.isDefaultBrowser(); done.done(true, new JSONObject().put("http", d).put("https", d)); }
                    return;
                }
                case "brand": done.done(true, m.optString("act").equals("apply") ? Boolean.FALSE : new JSONObject().put("supported", false)); return;
                case "update": {
                    if (m.optString("act").equals("install")) done.done(true, app.updates.install());
                    else { app.updates.check(true); done.done(true, true); }
                    return;
                }
                default: done.done(false, "unknown op " + op);
            }
        } catch (Exception e) { done.done(false, String.valueOf(e.getMessage())); }
    }

    private Tabs.Tab tabOf(JSONObject m) { Win w = app.window(m.optInt("window")); return w == null ? null : w.tabs.get(m.optInt("tab")); }

    private Object rewindFiles(JSONObject m) {
        File dir = new File(dataDir, "rewind");
        switch (m.optString("act")) {
            case "delete": {
                JSONArray ids = m.optJSONArray("ids");
                for (int i = 0; ids != null && i < ids.length(); i++) { String id = ids.optString(i); if (id.matches("^[a-z0-9]{6,20}$")) new File(dir, id + ".jpg").delete(); }
                return true;
            }
            case "clear": { File[] l = dir.listFiles(); if (l != null) for (File f : l) f.delete(); return true; }
            case "size": { long n = 0; File[] l = dir.listFiles(); if (l != null) for (File f : l) n += f.length(); return n; }
            default: return false;
        }
    }

    /** Cookies / site data / cache, for one site (site:clearData) or everything (privacy:clear). */
    private void clearData(JSONObject m, Reply done) {
        String origin = m.optString("origin");
        CookieManager cm = CookieManager.getInstance();
        if (!origin.isEmpty()) {
            WebStorage.getInstance().deleteOrigin(origin);
            String host = Uri.parse(origin).getHost();
            String cookies = cm.getCookie(origin);
            if (cookies != null && host != null) {
                for (String part : cookies.split(";")) {
                    String name = part.split("=", 2)[0].trim(); if (name.isEmpty()) continue;
                    for (String d : new String[]{host, "." + host, host.replaceFirst("^www\\.", ".")}) cm.setCookie(origin, name + "=; Max-Age=0; Path=/; Domain=" + d);
                    cm.setCookie(origin, name + "=; Max-Age=0; Path=/");
                }
            }
            cm.flush(); done.done(true, true); return;
        }
        if (m.optBoolean("cookies")) { cm.removeAllCookies(null); WebStorage.getInstance().deleteAllData(); cm.flush(); }
        if (m.optBoolean("cache")) { WebView any = new WebView(app); any.clearCache(true); any.destroy(); }
        done.done(true, true);
    }

    /** One profile on Android (the Mac app's Profiles are separate data folders with their own windows). */
    private void profiles(JSONObject m, Reply done) throws JSONException {
        String act = m.optString("act");
        JSONArray list = new JSONArray().put(new JSONObject().put("id", "default").put("name", "Default").put("color", "clay"));
        switch (act) {
            case "list": done.done(true, new JSONObject().put("current", "default").put("list", list)); return;
            case "picker": done.done(true, new JSONObject().put("on", false).put("count", 1)); return;
            case "create": done.done(true, null); return;
            case "setPicker": case "open": case "remove": done.done(true, false); return;
            default: done.done(true, true);   // "sync" (name and colour of this profile)
        }
    }

    /** HTTP for Buddy (no CORS limits, like Node's fetch in the Electron main process); streams chunks if asked. */
    private void fetch(JSONObject m, Reply done) {
        String fid = m.optString("fid"); int id = m.optInt("id"); boolean stream = m.optBoolean("stream");
        Uri u = Uri.parse(m.optString("url"));
        if (u.getScheme() == null || !(u.getScheme().equals("https") || u.getScheme().equals("http"))) { done.done(false, "bad url"); return; }
        work.execute(() -> {
            HttpURLConnection c = null;
            try {
                c = (HttpURLConnection) new URL(m.optString("url")).openConnection();
                fetches.put(fid, c);
                c.setRequestMethod(m.optString("method", "GET").toUpperCase());
                int timeout = (int) (m.optDouble("timeout", 0) > 0 ? m.optDouble("timeout") * 1000 : 300000);
                c.setConnectTimeout(Math.min(timeout, 30000)); c.setReadTimeout(timeout);
                JSONObject headers = m.optJSONObject("headers");
                boolean ua = false;
                if (headers != null) for (Iterator<String> k = headers.keys(); k.hasNext(); ) { String key = k.next(); c.setRequestProperty(key, headers.optString(key)); if (key.equalsIgnoreCase("user-agent")) ua = true; }
                if (!ua) c.setRequestProperty("User-Agent", "TheStupidBrowser/" + BuildConfigLite.version(app));
                if (m.has("body") && !m.isNull("body")) { c.setDoOutput(true); try (OutputStream o = c.getOutputStream()) { o.write(m.optString("body").getBytes(StandardCharsets.UTF_8)); } }
                int status = c.getResponseCode();
                InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
                StringBuilder body = new StringBuilder();
                if (in != null) {
                    CharsetDecoder dec = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPLACE).onUnmappableCharacter(CodingErrorAction.REPLACE);
                    ByteBuffer bb = ByteBuffer.allocate(65536); CharBuffer cb = CharBuffer.allocate(65536); byte[] buf = new byte[16384]; int n;
                    while ((n = in.read(buf)) > 0) {
                        bb.put(buf, 0, n); bb.flip(); dec.decode(bb, cb, false); bb.compact(); cb.flip();
                        String chunk = cb.toString(); cb.clear();
                        if (body.length() < 4_000_000) body.append(chunk);
                        if (stream && !chunk.isEmpty()) main.post(() -> run("__core.hostChunk(" + id + "," + JSONObject.quote(chunk) + ")"));
                    }
                    in.close();
                }
                JSONObject r = new JSONObject().put("status", status).put("body", body.toString());
                main.post(() -> done.done(true, r));
            } catch (Exception e) {
                boolean aborted = !fetches.containsKey(fid);
                main.post(() -> done.done(false, aborted ? "aborted" : String.valueOf(e.getMessage())));
            } finally { fetches.remove(fid); if (c != null) c.disconnect(); }
        });
    }

    static String json(Object v) {
        if (v == null || v == JSONObject.NULL) return "null";
        if (v instanceof String) return JSONObject.quote((String) v);
        if (v instanceof JSONObject || v instanceof JSONArray || v instanceof Boolean || v instanceof Number) return v.toString();
        return JSONObject.quote(String.valueOf(v));
    }
}
