package com.emil.stupidbrowser;

import android.annotation.SuppressLint;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Outline;
import android.graphics.RectF;
import android.net.Uri;
import android.os.Message;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewOutlineProvider;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.ProfileStore;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Native tabs (port of mac/Sources/Tabs.swift): one web view per <webview> stand-in in the UI. Reports
 *  Electron-style webview events back to it (did-navigate, page-title-updated, …) and does what the UI asks
 *  (load, back, reload, executeJavaScript, zoom, find…). */
final class Tabs {
    static final Set<String> ALL = Collections.singleton("*");
    static final Set<String> PAGES = Collections.singleton("https://*.stupid.internal");
    final Win owner;
    final FrameLayout layer;
    private final MainActivity app;
    private final Map<Integer, Tab> tabs = new HashMap<>();
    private final Map<Integer, ValueCallbackHolder> evals = new HashMap<>();
    private int evalSeq = 0;
    private String profile;   // a private window's own cookies and storage

    static final class ValueCallbackHolder { final Core.Reply done; ValueCallbackHolder(Core.Reply d) { done = d; } }

    final class Tab {
        final int id; WebView web; final boolean isTab; final String partition;
        String lastURL = "", failed; boolean loading, zoomed; float zoom = 1; float radius;
        String findText = ""; float touchX, touchY;
        Tab(int id, boolean isTab, String partition) { this.id = id; this.isTab = isTab; this.partition = partition; }
    }

    Tabs(Win owner) {
        this.owner = owner; this.app = owner.app;
        layer = new FrameLayout(app);
        layer.setClipChildren(false);   // a tab can reach past the bottom while the bars slide away
        if (owner.incognito && WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
            profile = "private-" + owner.id + "-" + System.currentTimeMillis();
            ProfileStore.getInstance().getOrCreateProfile(profile);
        }
    }
    Tab get(int id) { return tabs.get(id); }

    private void send(Tab t, String name, JSONObject detail) {
        owner.js("__stupidHost.tabEvent(" + t.id + "," + JSONObject.quote(name) + "," + (detail == null ? "{}" : detail) + ")");
    }
    private JSONObject state(Tab t) { try { return new JSONObject().put("canBack", t.web.canGoBack()).put("canFwd", t.web.canGoForward()); } catch (JSONException e) { return new JSONObject(); } }
    private JSONObject ctx() { return owner.ctx(); }

    /* ---------------- requests from the UI ---------------- */
    void handle(String type, JSONObject m) {
        int id = m.optInt("tab");
        if (type.equals("tab:create")) { create(id, m.optString("url", "about:blank"), m.optString("partition")); return; }
        Tab t = tabs.get(id);
        if (t == null) return;
        switch (type) {
            case "tab:destroy": destroy(t); break;
            case "tab:load": load(t, m.optString("url")); break;
            case "tab:back": t.web.goBack(); break;
            case "tab:forward": t.web.goForward(); break;
            case "tab:reload": if (m.optBoolean("hard")) t.web.clearCache(false); t.web.reload(); break;
            case "tab:stop": t.web.stopLoading(); break;
            case "tab:focus": t.web.requestFocus(); break;
            case "tab:zoom": {
                // The ⋮ menu's Zoom scales the whole page like on a computer (pinching still works on top).
                float z = (float) m.optDouble("zoom", 1);
                if (z > 0) { t.zoom = Math.max(0.25f, Math.min(5f, z)); applyZoom(t); }
                try { send(t, "state", new JSONObject().put("zoom", z)); } catch (JSONException ignored) { }
                break;
            }
            case "tab:mute": { boolean muted = m.optBoolean("muted"); t.web.evaluateJavascript("window.__stupidMuted=" + muted + ";document.querySelectorAll('video,audio').forEach(m=>m.muted=" + muted + ")", null); break; }
            case "tab:exec": exec(t, m.optString("code"), (ok, v) -> owner.reply(m.optInt("id"), ok, v)); break;
            case "tab:print": print(t); break;
            case "tab:find": find(t, m.optString("text"), m.optBoolean("forward", true)); break;
            default:
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private WebView makeView(Tab t) {
        WebView web = new WebView(app);
        if (profile != null) WebViewCompat.setProfile(web, profile);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setTextZoom(app.textZoom());
        if (owner.incognito) s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        web.setBackgroundColor(android.graphics.Color.WHITE);
        android.webkit.CookieManager.getInstance().setAcceptThirdPartyCookies(web, !owner.incognito);
        web.setVisibility(View.INVISIBLE);
        web.setOutlineProvider(new ViewOutlineProvider() {
            @Override public void getOutline(View v, Outline o) { o.setRoundRect(0, 0, v.getWidth(), v.getHeight(), t.radius); }
        });
        web.setClipToOutline(true);
        web.setOnTouchListener((v, e) -> { if (e.getActionMasked() == MotionEvent.ACTION_DOWN) { t.touchX = v.getX() + e.getX(); t.touchY = v.getY() + e.getY(); } return false; });
        web.setOnScrollChangeListener((v, x, y, ox, oy) -> { if (t.isTab && v.getVisibility() == View.VISIBLE) owner.pageScrolled(y - oy, y); });
        installScripts(web, t);
        web.setWebViewClient(new Client(t));
        web.setWebChromeClient(new Chrome(t));
        web.setDownloadListener((url, ua, disposition, mime, length) -> app.downloads.fromPage(url, ua, disposition, mime, length, owner));
        return web;
    }

    /** Page helpers (mac/js, shared with the Mac app), before any page script runs. */
    private void installScripts(WebView web, Tab t) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT) || !WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return;
        WebViewCompat.addWebMessageListener(web, "__stupidTab", ALL, (view, message, origin, isMainFrame, reply) -> helperMessage(t, message, origin.toString(), isMainFrame, reply));
        WebViewCompat.addWebMessageListener(web, "__stupidPageBridge", PAGES, (view, message, origin, isMainFrame, reply) -> { if (isMainFrame) pageCall(t, message.getData()); });
        StringBuilder top = new StringBuilder(), all = new StringBuilder();
        all.append(Assets.read(app, "android/tab-bridge.js")).append('\n');
        if (app.settingOn("dnt")) all.append("try { Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true }); Object.defineProperty(Navigator.prototype, 'doNotTrack', { get: () => '1' }); } catch {}\n");
        top.append(Assets.read(app, "mac/gen-media.js")).append('\n');
        top.append(Assets.helper(app, "tab-events.js", false)).append('\n');
        if (t.isTab) top.append(Assets.helper(app, "gen-select.js", false)).append('\n');
        all.append(Assets.helper(app, "tab-ctx.js", false)).append('\n');
        if (t.isTab && !owner.incognito) all.append(Assets.helper(app, "gen-pw.js", false)).append('\n');
        WebViewCompat.addDocumentStartJavaScript(web, all.toString(), ALL);
        WebViewCompat.addDocumentStartJavaScript(web, "if (window.top === window) {\n" + top + "\n}", ALL);
    }

    private void create(int id, String url, String partition) {
        boolean isTab = !partition.endsWith(":ai") && !partition.endsWith(":apps");
        Tab t = new Tab(id, isTab, partition);
        t.web = makeView(t);
        tabs.put(id, t);
        layer.addView(t.web, new FrameLayout.LayoutParams(1, 1));
        load(t, url);
    }

    void load(Tab t, String s) {
        if (s == null || s.isEmpty()) return;
        Uri u = Uri.parse(s);
        String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase();
        if (scheme.equals("stupid")) { t.web.loadUrl(Assets.toWeb(s)); return; }
        if (scheme.equals("http") || scheme.equals("https") || scheme.equals("about") || scheme.equals("data") || scheme.equals("blob")) t.web.loadUrl(s);
    }

    private void destroy(Tab t) {
        tabs.remove(t.id);
        t.web.stopLoading();
        layer.removeView(t.web);
        t.web.destroy();
    }
    void closeAll() {
        for (Tab t : new ArrayList<>(tabs.values())) destroy(t);
        if (profile != null) { String p = profile; profile = null; layer.post(() -> { try { ProfileStore.getInstance().deleteProfile(p); } catch (Exception ignored) { } }); }
    }

    /** Electron's executeJavaScript: evaluate in the page, wait if it's a promise, return a plain value. */
    void exec(Tab t, String code, Core.Reply done) {
        int rid = ++evalSeq;
        evals.put(rid, new ValueCallbackHolder(done));
        String wrapped = "(async () => { let r; try { r = { ok: true, value: await (\n" + code + "\n) }; } catch (e) { r = { ok: false, value: String(e && e.message || e) }; }"
            + " try { JSON.stringify(r.value); } catch { r.value = null; } window.__stupidTabPost && __stupidTabPost({ type: 'eval', rid: " + rid + ", ok: r.ok, value: r.value === undefined ? null : r.value }); })()";
        t.web.evaluateJavascript(wrapped, v -> {
            if (!"null".equals(v)) return;   // a promise: the answer comes through the helper channel
            // Not an expression (statements): run it as it is, like WebKit's evaluateJavaScript.
            ValueCallbackHolder h = evals.remove(rid);
            if (h != null) t.web.evaluateJavascript(code, raw -> h.done.done(true, parse(raw)));
        });
        t.web.postDelayed(() -> { ValueCallbackHolder h = evals.remove(rid); if (h != null) h.done.done(false, "no answer"); }, 20000);
    }
    private void applyZoom(Tab t) {
        if (t.zoom == 1 && !t.zoomed) return;
        t.zoomed = t.zoom != 1;
        t.web.evaluateJavascript("document.documentElement && (document.documentElement.style.zoom = " + (t.zoom == 1 ? "''" : String.valueOf(t.zoom)) + ")", null);
    }
    /** For the core (Buddy, Rewind). */
    void evalHelper(Tab t, String code, Core.Reply done) { exec(t, code, done); }
    private static Object parse(String raw) {
        if (raw == null || raw.equals("null") || raw.equals("undefined")) return null;
        try { return new org.json.JSONTokener(raw).nextValue(); } catch (JSONException e) { return null; }
    }

    /** A picture of a tab: base64 JPEG, or saved as a Rewind thumbnail (save: id). */
    void shot(Tab t, JSONObject m, File dir, Core.Reply done) {
        int w = t.web.getWidth(), h = t.web.getHeight();
        if (w <= 0 || h <= 0) { done.done(false, "no picture"); return; }
        double max = m.optDouble("width", 1400);
        float scale = (float) Math.min(1, max / w);
        Bitmap b = Bitmap.createBitmap(Math.max(1, (int) (w * scale)), Math.max(1, (int) (h * scale)), Bitmap.Config.RGB_565);
        Canvas c = new Canvas(b); c.scale(scale, scale); t.web.draw(c);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        b.compress(Bitmap.CompressFormat.JPEG, (int) (m.optDouble("quality", 0.7) * 100), out);
        b.recycle();
        String save = m.optString("save", "");
        if (!save.isEmpty()) {
            if (!save.matches("^[a-z0-9]{6,20}$")) { done.done(false, "bad id"); return; }
            dir.mkdirs();
            try (FileOutputStream f = new FileOutputStream(new File(dir, save + ".jpg"))) { f.write(out.toByteArray()); done.done(true, true); } catch (Exception e) { done.done(true, false); }
        } else done.done(true, Base64.getEncoder().encodeToString(out.toByteArray()));
    }

    private void print(Tab t) {
        PrintManager pm = (PrintManager) app.getSystemService(android.content.Context.PRINT_SERVICE);
        String name = t.web.getTitle() == null ? "Page" : t.web.getTitle();
        pm.print(name, t.web.createPrintDocumentAdapter(name), new PrintAttributes.Builder().build());
    }

    /** Find in page with Electron's match counts ("2 of 7"). */
    private void find(Tab t, String text, boolean forward) {
        if (text.isEmpty()) { t.findText = ""; t.web.clearMatches(); return; }
        t.web.setFindListener((active, count, done) -> {
            if (!done) return;
            try { send(t, "found-in-page", new JSONObject().put("result", new JSONObject().put("requestId", 1).put("activeMatchOrdinal", count == 0 ? 0 : active + 1).put("matches", count).put("finalUpdate", true))); } catch (JSONException ignored) { }
        });
        if (!text.equals(t.findText)) { t.findText = text; t.web.findAllAsync(text); } else t.web.findNext(forward);
    }

    /* ---------------- layout from the UI ---------------- */
    private JSONArray lastList, lastCovers;
    /** Again with the last positions (the bars slid away or came back). */
    void relayout() { if (lastList != null) layout(lastList, lastCovers); }
    void layout(JSONArray list, JSONArray covers) {
        if (list == null) return;
        lastList = list; lastCovers = covers;
        float dp = owner.dp();
        owner.shell.pass.clear(); owner.shell.covers.clear();
        for (int i = 0; i < list.length(); i++) {
            JSONObject d = list.optJSONObject(i); if (d == null) continue;
            Tab t = tabs.get(d.optInt("tab")); if (t == null) continue;
            float x = (float) d.optDouble("x") * dp, yUi = (float) d.optDouble("y") * dp, y = yUi - owner.barsShift();
            int w = Math.round((float) d.optDouble("w") * dp), h = Math.round((float) d.optDouble("h") * dp + owner.barsExtra());
            boolean shown = d.optBoolean("shown");
            if (shown && t.isTab && t.web.getVisibility() != View.VISIBLE) owner.showBars();   // switched tabs: bars back
            FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) t.web.getLayoutParams();
            if (lp.width != Math.max(1, w) || lp.height != Math.max(1, h)) { lp.width = Math.max(1, w); lp.height = Math.max(1, h); t.web.setLayoutParams(lp); }
            if (t.web.getX() != x) t.web.setX(x);
            if (t.web.getY() != y) t.web.setY(y);
            float r = (float) d.optDouble("radius") * dp;
            if (r != t.radius) { t.radius = r; t.web.invalidateOutline(); }
            float alpha = shown ? (float) d.optDouble("opacity", 1) : 0;
            if (t.web.getAlpha() != alpha) t.web.setAlpha(alpha);
            int vis = shown ? View.VISIBLE : View.INVISIBLE;
            if (t.web.getVisibility() != vis) t.web.setVisibility(vis);
            if (shown) owner.shell.pass.add(new RectF(x, yUi, x + w, yUi + h));   // in the UI's own coordinates (it slides with the bars)
        }
        for (int i = 0; covers != null && i < covers.length(); i++) {
            JSONObject c = covers.optJSONObject(i); if (c == null) continue;
            float x = (float) c.optDouble("x") * dp, y = (float) c.optDouble("y") * dp;
            owner.shell.covers.add(new RectF(x, y, x + (float) c.optDouble("w") * dp, y + (float) c.optDouble("h") * dp));
        }
    }
    /** The tab you're looking at (for the back gesture). */
    Tab visible() { for (Tab t : tabs.values()) if (t.isTab && t.web.getVisibility() == View.VISIBLE && t.web.getAlpha() > 0.5f) return t; return null; }

    /** Our pages (stupid://…) listen to core events through their bridge. */
    void emitToPages(String channel, JSONArray args) {
        for (Tab t : tabs.values()) if (Assets.isPage(t.web.getUrl())) t.web.evaluateJavascript("window.__stupidPage && __stupidPage.emit(" + JSONObject.quote(channel) + "," + args + ")", null);
    }
    void setTextZoom(int z) { for (Tab t : tabs.values()) t.web.getSettings().setTextZoom(z); }

    /* ---------------- our pages calling the core ---------------- */
    private void pageCall(Tab t, String data) {
        if (data == null || !Assets.isPage(t.web.getUrl())) return;
        try {
            JSONObject m = new JSONObject(data);
            if (m.has("log")) { android.util.Log.i("stupid-page", m.optString("log")); return; }
            int id = m.optInt("id");
            JSONArray args = m.optJSONArray("args"); if (args == null) args = new JSONArray();
            JSONObject c = ctx().put("page", Assets.toUi(t.web.getUrl()));
            app.core.invoke(m.optString("channel"), args, c, (ok, v) -> t.web.evaluateJavascript("window.__stupidPage && __stupidPage.reply(" + id + "," + ok + "," + Core.json(v) + ")", null));
        } catch (JSONException ignored) { }
    }

    /* ---------------- messages from the page helpers ---------------- */
    private void helperMessage(Tab t, WebMessageCompat message, String origin, boolean mainFrame, JavaScriptReplyProxy reply) {
        JSONObject wrap;
        try { wrap = new JSONObject(message.getData()); } catch (Exception e) { return; }
        int id = wrap.optInt("id");
        JSONObject msg = wrap.optJSONObject("msg"); if (msg == null) return;
        Core.Reply answer = (ok, v) -> { try { reply.postMessage(new JSONObject().put("id", id).put("value", v == null ? JSONObject.NULL : v).toString()); } catch (Exception ignored) { } };
        try {
            switch (msg.optString("type")) {
                case "eval": {
                    ValueCallbackHolder h = evals.remove(msg.optInt("rid"));
                    if (h != null) h.done.done(msg.optBoolean("ok"), msg.opt("value"));
                    break;
                }
                case "dom-ready": {
                    if (!mainFrame) break;
                    t.zoomed = false; applyZoom(t);   // a new page: the tab's zoom again
                    send(t, "dom-ready", null);
                    if (t.isTab && app.settingOn("adblock")) {
                        String u = t.web.getUrl();
                        app.core.invoke("ads:css", new JSONArray().put(u == null ? "" : u), ctx(), (ok, css) -> {
                            if (ok && css instanceof String && !((String) css).isEmpty())
                                t.web.evaluateJavascript("(() => { const s = document.createElement('style'); s.textContent = " + JSONObject.quote((String) css) + "; (document.head || document.documentElement).appendChild(s); })()", null);
                        });
                    }
                    break;
                }
                case "favicons": if (mainFrame) send(t, "page-favicon-updated", new JSONObject().put("favicons", msg.optJSONArray("list") == null ? new JSONArray() : msg.optJSONArray("list"))); break;
                case "focus": if (mainFrame) send(t, "focus", null); break;
                case "ipc": send(t, "ipc-message", new JSONObject().put("channel", msg.optString("channel")).put("args", msg.optJSONArray("args") == null ? new JSONArray() : msg.optJSONArray("args"))); break;
                case "ctx": {
                    // Hold a link or picture: the desktop page menu. Text keeps Android's own selection menu.
                    if (msg.optBoolean("editable") || (msg.optString("link").isEmpty() && msg.optString("media").equals("none"))) break;
                    float dp = owner.dp();
                    JSONObject info = new JSONObject(msg.toString()).put("tab", t.id).put("searchUrl", app.core.settings.optString("searchUrl")).put("engineName", app.core.settings.optString("engineName"));
                    owner.js("window.__androidPageMenu && __androidPageMenu(" + info + "," + (t.touchX / dp) + "," + (t.touchY / dp) + ")");
                    break;
                }
                case "pw:query":
                    if (!t.isTab || owner.incognito) { answer.done(true, new JSONArray()); return; }
                    app.core.invoke("pw:query", new JSONArray(), ctx().put("origin", origin), (ok, v) -> answer.done(true, ok ? v : new JSONArray()));
                    return;
                case "pw:submitted":
                    if (t.isTab && !owner.incognito) app.core.invoke("pw:submitted", new JSONArray().put(msg.opt("data") == null ? JSONObject.NULL : msg.opt("data")), ctx().put("origin", origin).put("tab", t.id), null);
                    break;
                default:
            }
        } catch (JSONException ignored) { }
        answer.done(true, null);
    }

    /** The browser's own "Can't reach this page" (instead of Android's), with Try again. */
    private String errorPage(Uri u, int code, String desc) {
        String host = u.getHost() == null ? u.toString() : u.getHost().replaceFirst("^www\\.", "");
        String why;
        switch (code) {
            case WebViewClient.ERROR_HOST_LOOKUP: why = "couldn’t be found. Check the address, or your internet connection."; break;
            case WebViewClient.ERROR_CONNECT: case WebViewClient.ERROR_IO: why = "didn’t answer. Check your internet connection and try again."; break;
            case WebViewClient.ERROR_TIMEOUT: why = "took too long to answer."; break;
            case WebViewClient.ERROR_FAILED_SSL_HANDSHAKE: why = "doesn’t have a secure connection right now."; break;
            default: why = "couldn’t be loaded.";
        }
        String esc = host.replace("&", "&amp;").replace("<", "&lt;");
        return Assets.read(app, "android/error.html").replace("__HOST__", esc).replace("__WHY__", why).replace("__CODE__", desc.replace("&", "&amp;").replace("<", "&lt;"));
    }

    /* ---------------- navigation → Electron webview events ---------------- */
    final class Client extends WebViewClient {
        final Tab t;
        Client(Tab t) { this.t = t; }
        @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
            Uri u = r.getUrl();
            String host = u.getHost();
            if (host != null && host.endsWith(".stupid.internal")) return Assets.serve(app, u, app.core.dataDir);
            if (host != null && host.endsWith(".stupidapp.internal")) return Assets.missing();   // the UI and core are never shown in a tab
            if (t.isTab && !r.isForMainFrame() && app.settingOn("adblock") && app.adblock.blocks(host)) { app.blocked(); return Assets.empty(); }
            return null;
        }
        @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
            Uri u = r.getUrl(); String s = u.getScheme() == null ? "" : u.getScheme().toLowerCase();
            if (s.equals("stupid")) { load(t, u.toString()); return true; }
            if (s.equals("http") || s.equals("https") || s.equals("about") || s.equals("data") || s.equals("blob")) return false;
            app.openOtherApp(u, v);   // mailto:, tel:, intent:, app links
            return true;
        }
        @Override public void onPageStarted(WebView v, String url, Bitmap favicon) {
            t.loading = true; t.findText = "";
            if (v.getVisibility() == View.VISIBLE) owner.showBars();
            send(t, "did-start-loading", null);
            navigated(url, false);
        }
        @Override public void doUpdateVisitedHistory(WebView v, String url, boolean reload) { if (!url.equals(t.lastURL)) navigated(url, !t.loading); else send(t, "state", state(t)); }
        @Override public void onPageFinished(WebView v, String url) {
            t.loading = false;
            if (t.failed != null) { v.evaluateJavascript("document.open();document.write(" + JSONObject.quote(t.failed) + ");document.close()", null); t.failed = null; }
            send(t, "did-stop-loading", state(t));
        }
        private void navigated(String url, boolean inPage) {
            t.lastURL = url;
            try { send(t, inPage ? "did-navigate-in-page" : "did-navigate", state(t).put("url", Assets.toUi(url)).put("isMainFrame", true)); } catch (JSONException ignored) { }
            if (t.isTab) owner.recordVisit(url, t.web.getTitle(), false);
        }
        @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
            if (!r.isForMainFrame()) return;
            int code = e.getErrorCode();
            t.failed = errorPage(r.getUrl(), code, String.valueOf(e.getDescription()));
            try { send(t, "did-fail-load", new JSONObject().put("errorCode", code == -3 ? -300 : code).put("errorDescription", String.valueOf(e.getDescription())).put("validatedURL", r.getUrl().toString()).put("isMainFrame", true)); } catch (JSONException ignored) { }
        }
        // Android stopped the page's process (low memory or a crash): a fresh view takes its place.
        @Override public boolean onRenderProcessGone(WebView v, android.webkit.RenderProcessGoneDetail detail) {
            if (t.web != v) return true;
            String url = t.lastURL;
            int i = layer.indexOfChild(v);
            FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) v.getLayoutParams();
            float x = v.getX(), y = v.getY(), a = v.getAlpha(); int vis = v.getVisibility();
            layer.removeView(v); v.destroy();
            t.web = makeView(t); t.zoomed = false;
            layer.addView(t.web, i, lp); t.web.setX(x); t.web.setY(y); t.web.setAlpha(a); t.web.setVisibility(vis);
            try { send(t, "render-process-gone", new JSONObject().put("details", new JSONObject().put("reason", "crashed"))); } catch (JSONException ignored) { }
            if (!url.isEmpty()) t.web.loadUrl(url);
            return true;
        }
    }

    final class Chrome extends WebChromeClient {
        final Tab t;
        Chrome(Tab t) { this.t = t; }
        @Override public void onReceivedTitle(WebView v, String title) {
            try { send(t, "page-title-updated", new JSONObject().put("title", title == null ? "" : title)); } catch (JSONException ignored) { }
            if (t.isTab && title != null && !title.isEmpty()) owner.recordVisit(v.getUrl(), title, true);
        }
        // Links that open a new window open as a tab, like the Electron app: catch the address, then let go.
        @Override public boolean onCreateWindow(WebView v, boolean dialog, boolean gesture, Message msg) {
            if (!gesture) return false;   // no pop-ups you didn't tap for
            WebView probe = new WebView(app);
            probe.setWebViewClient(new WebViewClient() {
                boolean done;
                private void open(String url) {
                    if (done) return; done = true;
                    if (url.startsWith("http") || url.startsWith("stupid:")) {
                        try { owner.emit("open-url", new JSONArray().put(new JSONObject().put("url", url).put("where", "foreground").put("opener", t.id))); } catch (JSONException ignored) { }
                    } else app.openOtherApp(Uri.parse(url), v);
                    probe.post(probe::destroy);
                }
                @Override public boolean shouldOverrideUrlLoading(WebView p, WebResourceRequest r) { open(r.getUrl().toString()); return true; }
                @Override public void onPageStarted(WebView p, String url, Bitmap f) { if (!"about:blank".equals(url)) { p.stopLoading(); open(url); } }
            });
            ((WebView.WebViewTransport) msg.obj).setWebView(probe);
            msg.sendToTarget();
            return true;
        }
        @Override public void onShowCustomView(View view, CustomViewCallback cb) { app.showFullscreen(view, cb); send(t, "enter-html-full-screen", null); }
        @Override public void onHideCustomView() { app.hideFullscreen(); send(t, "leave-html-full-screen", null); }
        @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) { return app.chooseFile(cb, p); }
        // Camera, microphone, location: the same per-site allow / ask / block as the desktop app.
        @Override public void onPermissionRequest(PermissionRequest r) {
            List<String> kinds = new ArrayList<>(); Set<String> grant = new HashSet<>();
            for (String res : r.getResources()) {
                if (res.equals(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) { kinds.add("camera"); grant.add(res); }
                else if (res.equals(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) { kinds.add("microphone"); grant.add(res); }
                else if (res.equals(PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID)) grant.add(res);
            }
            if (kinds.isEmpty()) { if (grant.isEmpty()) r.deny(); else r.grant(grant.toArray(new String[0])); return; }
            ask(r.getOrigin().toString(), kinds, ok -> { if (ok) r.grant(grant.toArray(new String[0])); else r.deny(); });
        }
        @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
            List<String> kinds = new ArrayList<>(); kinds.add("location");
            ask(origin, kinds, ok -> cb.invoke(origin, ok, false));
        }
        private void ask(String origin, List<String> kinds, java.util.function.Consumer<Boolean> done) {
            String o = origin.replaceAll("/+$", "");
            JSONObject c = ctx(); try { c.put("tab", t.id); } catch (JSONException ignored) { }
            app.core.invoke("perm:request", new JSONArray().put(o).put(new JSONArray(kinds)), c, (ok, v) -> {
                if (!(ok && Boolean.TRUE.equals(v))) { done.accept(false); return; }
                app.androidPermissions(kinds, done);   // and Android's own permission for the app, once
            });
        }
    }

    /** Opened from another app (or the share sheet): shown as a new tab in this window. */
    void openUrl(String url) { try { owner.emit("open-url", new JSONArray().put(new JSONObject().put("url", url).put("where", "foreground"))); } catch (JSONException ignored) { } }
}
