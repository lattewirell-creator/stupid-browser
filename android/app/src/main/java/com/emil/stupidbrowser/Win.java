package com.emil.stupidbrowser;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Color;
import android.graphics.RectF;
import android.graphics.drawable.GradientDrawable;
import android.view.MotionEvent;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** A browser window (port of mac/Sources/BrowserWindow.swift): the desktop UI (src/index.html) in a
 *  transparent web view on top, the tabs as web views underneath, placed where the UI's <webview>
 *  stand-ins are. Touches go to a tab when they land on it and no UI covers that spot. */
final class Win {
    private static int nextId = 1;
    final int id;
    final boolean incognito;
    final MainActivity app;
    final FrameLayout stage;     // the frame colour behind everything
    final Shell shell;
    final Tabs tabs;
    private List<String> pendingUrls;
    private final boolean startup;
    private boolean shownOnce;
    final GradientDrawable frame = new GradientDrawable();

    /** The UI layer: lets touches through to the tab below wherever the page shows. */
    static final class Shell extends WebView {
        final List<RectF> pass = new ArrayList<>(), covers = new ArrayList<>();
        Runnable touched;   // a touch on the UI itself (the bars come back)
        Shell(Context c) { super(c); }
        @Override public boolean dispatchTouchEvent(MotionEvent e) {
            if (e.getActionMasked() == MotionEvent.ACTION_DOWN) {
                float x = e.getX(), y = e.getY();
                boolean onTab = false;
                for (RectF r : pass) if (r.contains(x, y)) { onTab = true; break; }
                if (onTab) for (RectF r : covers) if (r.contains(x, y)) { onTab = false; break; }
                if (onTab) return false;   // the parent offers it to the tab underneath
                if (touched != null) touched.run();
            }
            return super.dispatchTouchEvent(e);
        }
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    Win(MainActivity app, boolean incognito, List<String> urls, boolean startup) {
        this.app = app; this.incognito = incognito; this.pendingUrls = urls; this.startup = startup;
        id = nextId++;
        stage = new FrameLayout(app);
        frame.setGradientType(GradientDrawable.RADIAL_GRADIENT);
        frame.setColors(new int[]{0xFFFAF9F5, 0xFFFAF9F5});
        stage.setBackground(frame);
        tabs = new Tabs(this);
        stage.addView(tabs.layer, new FrameLayout.LayoutParams(-1, -1));
        shell = new Shell(app);
        shell.setBackgroundColor(Color.TRANSPARENT);
        shell.getSettings().setJavaScriptEnabled(true);
        shell.getSettings().setDomStorageEnabled(true);
        shell.getSettings().setAllowFileAccess(false);
        shell.getSettings().setAllowContentAccess(false);
        shell.getSettings().setMediaPlaybackRequiresUserGesture(false);
        shell.getSettings().setTextZoom(100);
        shell.getSettings().setUseWideViewPort(true);    // honour the UI's viewport (75%, no zooming)
        shell.getSettings().setLoadWithOverviewMode(false);
        shell.getSettings().setSupportZoom(false);
        shell.setOverScrollMode(View.OVER_SCROLL_NEVER);
        shell.addJavascriptInterface(new Bridge(), "StupidHostNative");
        shell.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                WebResourceResponse res = Assets.serve(app, r.getUrl(), app.core.dataDir);
                if (res != null) return res;
                // The UI shows site icons and images from the web; it never loads pages.
                return r.isForMainFrame() ? Assets.missing() : null;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return true; }
            @Override public void onPageFinished(WebView v, String url) { applyLook(); }
        });
        shell.setWebChromeClient(new android.webkit.WebChromeClient() {
            @Override public boolean onConsoleMessage(android.webkit.ConsoleMessage m) {
                if (m.messageLevel() == android.webkit.ConsoleMessage.MessageLevel.ERROR) android.util.Log.w("stupid-ui", m.message() + " (" + m.sourceId() + ":" + m.lineNumber() + ")");
                return true;
            }
            @Override public boolean onShowFileChooser(WebView v, android.webkit.ValueCallback<android.net.Uri[]> cb, FileChooserParams p) { return app.chooseFile(cb, p); }
        });
        stage.addView(shell, new FrameLayout.LayoutParams(-1, -1));
        shell.touched = this::showBars;
        shell.loadUrl(Assets.SHELL + "/index.html");
    }

    /** Device pixels per CSS pixel of the UI (the UI is shown at Assets.UI_SCALE). */
    float dp() { return app.getResources().getDisplayMetrics().density * Assets.UI_SCALE; }
    void js(String code) { shell.evaluateJavascript(code, null); }
    /** Events to the UI (Electron's webContents.send). */
    void emit(String channel, JSONArray args) { js("window.__stupidHost && __stupidHost.emit(" + JSONObject.quote(channel) + "," + args + ")"); }
    void reply(int id, boolean ok, Object value) { js("__stupidHost.reply(" + id + "," + ok + "," + Core.json(value) + ")"); }
    JSONObject ctx() { try { return new JSONObject().put("window", id).put("incognito", incognito); } catch (JSONException e) { return new JSONObject(); } }

    /** Messages from the UI (mac/js/host-shell.js), only from our own UI page. */
    final class Bridge {
        @JavascriptInterface public void post(String body) {
            app.runOnUiThread(() -> {
                String url = shell.getUrl();
                if (url == null || !url.startsWith(Assets.SHELL + "/")) return;
                try { message(new JSONObject(body)); } catch (JSONException ignored) { }
            });
        }
    }

    private void message(JSONObject m) throws JSONException {
        String type = m.optString("type");
        int rid = m.optInt("id");
        switch (type) {
            case "invoke": {
                String channel = m.optString("channel");
                JSONArray args = m.optJSONArray("args"); if (args == null) args = new JSONArray();
                Object local = handleLocally(channel, args);
                if (local != null) { reply(rid, true, local); return; }
                JSONObject ctx = ctx();
                if (channel.equals("win:info")) { ctx.put("urls", pendingUrls == null ? JSONObject.NULL : new JSONArray(pendingUrls)).put("startup", startup); pendingUrls = null; }
                app.core.invoke(channel, args, ctx, (ok, v) -> reply(rid, ok, v));
                return;
            }
            case "log": android.util.Log.i("stupid-ui", m.optString("text")); return;
            case "layout": {
                if (!shownOnce) { shownOnce = true; android.util.Log.i("stupid-perf", "window ready " + (android.os.SystemClock.uptimeMillis() - android.os.Process.getStartUptimeMillis()) + " ms after start"); }
                tabs.layout(m.optJSONArray("tabs"), m.optJSONArray("covers"));
                JSONObject f = m.optJSONObject("frame");
                if (f != null) look(f);
                return;
            }
            case "android:bars": barsPx = (float) m.optDouble("h", 0) * dp(); if (barsPx <= 0) showBars(); return;
            case "android:haptic": shell.performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS); return;
            case "android:save": { Tabs.Tab t = tabs.get(m.optInt("tab")); app.downloads.start(m.optString("url"), t == null ? null : t.web, this); return; }
            default: if (type.startsWith("tab:")) tabs.handle(type, m);
        }
    }

    /** Window-level channels that need this window (the rest go to the core). */
    private Object handleLocally(String channel, JSONArray args) {
        switch (channel) {
            case "win:close": app.closeWindow(this); return true;
            case "win:fullscreen": case "win:trafficLights": return true;
            case "win:new": {
                JSONObject o = args.optJSONObject(0);
                List<String> urls = null;
                if (o != null && o.has("url")) { urls = new ArrayList<>(); urls.add(o.optString("url")); }
                app.openWindow(o != null && o.optBoolean("incognito"), urls);
                return true;
            }
            default: return null;
        }
    }

    /* ---------------- bars that slide away while you scroll down (like Firefox) ---------------- */
    private float barsPx;          // height of the tab strip + toolbar
    private boolean barsHidden, barsSettled;
    private float scrollRun;       // how far the page moved in one direction
    /** Extra tab height while the bars are away (the page fills the space they leave). */
    float barsExtra() { return barsHidden ? barsPx : 0; }
    /** While the bars are away the tabs sit higher (after the slide; during it the whole layer moves). */
    float barsShift() { return barsHidden && barsSettled ? barsPx : 0; }
    private boolean scrolling;
    private final Runnable scrollEnded = () -> { scrolling = false; js("dispatchEvent(new CustomEvent('stupid-buddy-pause', { detail: false }))"); };
    void pageScrolled(int dy, int y) {
        // While a page scrolls, Buddy holds still so the page gets every frame.
        if (!scrolling) { scrolling = true; js("dispatchEvent(new CustomEvent('stupid-buddy-pause', { detail: true }))"); }
        shell.removeCallbacks(scrollEnded); shell.postDelayed(scrollEnded, 450);
        if (barsPx <= 0 || dy == 0) return;
        if ((dy > 0) != (scrollRun > 0)) scrollRun = 0;
        scrollRun += dy;
        float slop = 24 * app.getResources().getDisplayMetrics().density;
        if (scrollRun > slop && y > barsPx && !barsHidden) hideBars();
        else if ((scrollRun < -slop || y <= 0) && barsHidden) showBars();
    }
    private void hideBars() {
        barsHidden = true; barsSettled = false;
        tabs.relayout();   // the page grows first (past the screen edge), then the bars and page slide up together
        shell.animate().translationY(-barsPx).setDuration(200).setInterpolator(new android.view.animation.DecelerateInterpolator()).start();
        tabs.layer.animate().translationY(-barsPx).setDuration(200).setInterpolator(new android.view.animation.DecelerateInterpolator())
            .withEndAction(() -> { if (!barsHidden) return; barsSettled = true; tabs.layer.setTranslationY(0); tabs.relayout(); }).start();
    }
    void showBars() {
        if (!barsHidden) return;
        barsHidden = false; scrollRun = 0;
        if (barsSettled) { barsSettled = false; tabs.layer.setTranslationY(-barsPx); tabs.relayout(); }   // same picture, now moved by the layer
        shell.animate().translationY(0).setDuration(200).setInterpolator(new android.view.animation.DecelerateInterpolator()).start();
        tabs.layer.animate().translationY(0).setDuration(200).setInterpolator(new android.view.animation.DecelerateInterpolator())
            .withEndAction(() -> { if (!barsHidden) tabs.relayout(); }).start();
    }

    /* ---------------- the frame behind the UI (the Electron CSS's colours and clay tint) ---------------- */
    private String lastLook = "";
    private void look(JSONObject f) {
        String key = f.toString();
        if (key.equals(lastLook)) return;
        lastLook = key;
        Integer bar = cssColor(f.optString("bar")), accent = cssColor(f.optString("accent"));
        if (bar == null) return;
        if (accent == null) accent = bar;
        String tint = f.optString("tint", "soft");
        boolean modern = f.optBoolean("modern", true);
        float mix = !modern || tint.equals("none") ? 0 : tint.equals("strong") ? 0.34f : 0.14f;
        int start = blend(bar, accent, mix), end = tint.equals("strong") && modern ? blend(bar, accent, 0.12f) : bar;
        frame.setColors(new int[]{start, end});
        frame.setGradientCenter(0, 0);
        frame.setGradientRadius(Math.max(stage.getWidth(), stage.getHeight()) * 1.2f + 1);
        app.barColors(bar, incognito);
    }
    /** Shown again (a private window on top closed): the system bars take this window's colours back. */
    void refreshLook() { applyLook(); }
    private void applyLook() { if (!lastLook.isEmpty()) try { String k = lastLook; lastLook = ""; look(new JSONObject(k)); } catch (JSONException ignored) { } }
    static int blend(int a, int b, float t) {
        int r = (int) (Color.red(a) + (Color.red(b) - Color.red(a)) * t), g = (int) (Color.green(a) + (Color.green(b) - Color.green(a)) * t), bl = (int) (Color.blue(a) + (Color.blue(b) - Color.blue(a)) * t);
        return Color.rgb(r, g, bl);
    }
    static Integer cssColor(String s) {
        String t = s == null ? "" : s.trim();
        try {
            if (t.startsWith("#")) {
                String hex = t.substring(1);
                if (hex.length() == 3) hex = "" + hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2);
                return 0xFF000000 | Integer.parseInt(hex.substring(0, 6), 16);
            }
            if (t.startsWith("rgb")) {
                String[] n = t.replaceAll("[^0-9.,]", "").split(",");
                return Color.rgb((int) Float.parseFloat(n[0]), (int) Float.parseFloat(n[1]), (int) Float.parseFloat(n[2]));
            }
        } catch (Exception ignored) { }
        return null;
    }

    /** History is recorded here, like the Electron main process watching webContents. */
    void recordVisit(String url, String title, boolean titleOnly) {
        if (incognito || url == null || !url.startsWith("http")) return;
        app.core.invoke(titleOnly ? "history:title" : "history:visit", new JSONArray().put(url).put(title == null ? "" : title), ctx(), null);
    }

    void destroy() {
        app.core.invoke("win:closed", new JSONArray(), ctx(), null);
        tabs.closeAll();
        shell.removeJavascriptInterface("StupidHostNative");
        shell.destroy();
    }

    static List<String> strings(JSONArray a) { List<String> l = new ArrayList<>(); for (int i = 0; i < a.length(); i++) l.add(a.optString(i)); return l; }
}
