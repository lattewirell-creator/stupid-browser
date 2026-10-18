package com.emil.stupidbrowser;

import android.app.Activity;
import android.app.role.RoleManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.window.OnBackInvokedDispatcher;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

/** The Stupid Browser for Android: the desktop app's own UI and features (src/ and the shared core in mac/),
 *  fitted to a phone. One window shows at a time; a private window sits on top until you close it. */
public final class MainActivity extends Activity {
    Core core;
    final List<Win> windows = new ArrayList<>();
    AdBlock adblock;
    Downloads downloads;
    Updates updates;
    private FrameLayout root;
    private View fullscreen;
    private WebChromeClient.CustomViewCallback fullscreenDone;
    private ValueCallback<Uri[]> fileCallback;
    private Core.Reply textFileDone;
    private long textFileMax;
    private Consumer<Boolean> permissionDone;
    private final List<String> pendingUrls = new ArrayList<>();
    private boolean ready;
    private int blockedCount;
    private boolean blockedQueued;

    @Override protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        WebView.setWebContentsDebuggingEnabled(BuildConfigLite.debuggable(this));
        getWindow().setDecorFitsSystemWindows(false);
        getWindow().setNavigationBarContrastEnforced(false);   // the bars show the browser's own frame colour
        getWindow().setStatusBarContrastEnforced(false);
        root = new FrameLayout(this);
        root.setBackgroundColor(night() ? 0xFF1F1E1D : 0xFFFAF9F5);
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime() | WindowInsets.Type.displayCutout());
            v.setPadding(i.left, i.top, i.right, i.bottom);
            if (insets.isVisible(WindowInsets.Type.ime())) { Win w = current(); if (w != null) w.showBars(); }   // typing: bars stay
            return WindowInsets.CONSUMED;
        });
        setContentView(root);
        adblock = new AdBlock(this);
        downloads = new Downloads(this);
        updates = new Updates(this);
        core = new Core(this);
        root.addView(core.web, new FrameLayout.LayoutParams(1, 1));   // hidden; runs the browser's logic
        core.web.setVisibility(View.INVISIBLE);
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::back);
        String u = urlFrom(getIntent());
        if (u != null) pendingUrls.add(u);
        core.start(() -> core.invoke("app:startup", new JSONArray().put(new JSONArray(pendingUrls)), new JSONObject(), (ok, n) -> {
            pendingUrls.clear();
            ready = true;
            openWindow(false, null, true);
            updates.check(false);
        }));
    }
    boolean night() { return (getResources().getConfiguration().uiMode & android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES; }

    /* ---------------- windows ---------------- */
    void openWindow(boolean incognito, List<String> urls) { openWindow(incognito, urls, false); }
    private void openWindow(boolean incognito, List<String> urls, boolean startup) {
        Win w = new Win(this, incognito, urls, startup);
        Win before = current();
        windows.add(w);
        root.addView(w.stage, new FrameLayout.LayoutParams(-1, -1));
        if (before != null) before.stage.setVisibility(View.GONE);
    }
    void closeWindow(Win w) {
        if (!windows.remove(w)) return;
        root.removeView(w.stage);
        w.destroy();
        Win top = current();
        if (top != null) { top.stage.setVisibility(View.VISIBLE); top.refreshLook(); }
        else openWindow(false, null);
    }
    Win current() { return windows.isEmpty() ? null : windows.get(windows.size() - 1); }
    Win window(int id) { for (Win w : windows) if (w.id == id) return w; return null; }

    /* ---------------- settings that change the app itself ---------------- */
    private static final String[] SIZES = {"small", "medium", "large", "xlarge"};
    private static final int[] ZOOMS = {88, 100, 119, 138};
    int textZoom() { String s = core.settings.optString("fontSize", "medium"); for (int i = 0; i < SIZES.length; i++) if (SIZES[i].equals(s)) return ZOOMS[i]; return 100; }
    boolean settingOn(String key) { return core.settings.optBoolean(key, key.equals("adblock")); }
    void applySettings(JSONObject s, JSONArray changed) {
        for (int i = 0; changed != null && i < changed.length(); i++) if (changed.optString(i).equals("fontSize")) for (Win w : windows) w.tabs.setTextZoom(textZoom());
    }
    /** System bars match the browser's frame colour. */
    void barColors(int bar, boolean incognito) {
        root.setBackgroundColor(bar);
        boolean light = Color.luminance(bar) > 0.5f;
        WindowInsetsController c = getWindow().getInsetsController();
        if (c != null) c.setSystemBarsAppearance(light ? WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS : 0,
            WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
    }
    /** Shield's counter, sent to the core at most once a second. */
    void blocked() {
        blockedCount++;
        if (blockedQueued) return;
        blockedQueued = true;
        root.postDelayed(() -> { blockedQueued = false; core.invoke("ads:count", new JSONArray().put(blockedCount), new JSONObject(), null); }, 1000);
    }

    /* ---------------- back gesture: close what's open, then go back, then leave ---------------- */
    private void back() {
        if (fullscreen != null) { if (fullscreenDone != null) fullscreenDone.onCustomViewHidden(); hideFullscreen(); return; }
        Win w = current();
        if (w == null) { moveTaskToBack(true); return; }
        w.shell.evaluateJavascript("window.__androidBack ? __androidBack() : ''", r -> {
            if ("\"ui\"".equals(r)) return;
            Tabs.Tab t = w.tabs.visible();
            if (t != null && t.web.canGoBack()) { t.web.goBack(); return; }
            if (w.incognito) { closeWindow(w); return; }
            moveTaskToBack(true);
        });
    }
    @SuppressWarnings("deprecation")
    @Override public void onBackPressed() { back(); }

    /* ---------------- links from other apps, the share sheet, web searches ---------------- */
    @Override protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        String u = urlFrom(i);
        if (u == null) return;
        if (!ready) { pendingUrls.add(u); return; }
        Win w = current();
        if (w != null && w.incognito) { closeWindow(w); w = current(); }
        if (w != null) w.tabs.openUrl(u);
    }
    private String urlFrom(Intent i) {
        if (i == null) return null;
        if (Intent.ACTION_VIEW.equals(i.getAction()) && i.getData() != null) { String s = i.getDataString(); return s != null && (s.startsWith("http://") || s.startsWith("https://")) ? s : null; }
        String q = Intent.ACTION_SEND.equals(i.getAction()) ? i.getStringExtra(Intent.EXTRA_TEXT) : Intent.ACTION_WEB_SEARCH.equals(i.getAction()) ? i.getStringExtra("query") : null;
        if (q == null || q.trim().isEmpty()) return null;
        q = q.trim();
        if (q.matches("^https?://\\S+$")) return q;
        String search = core != null ? core.settings.optString("searchUrl", "") : "";
        if (search.isEmpty()) search = "https://duckduckgo.com/?q=%s";
        return search.replace("%s", Uri.encode(q));
    }
    void openExternal(Uri u) { try { startActivity(new Intent(Intent.ACTION_VIEW, u).addCategory(Intent.CATEGORY_BROWSABLE)); } catch (ActivityNotFoundException ignored) { } }
    /** mailto:, tel:, intent:, app links → other apps (falls back to the link's web address). */
    void openOtherApp(Uri u, WebView from) {
        String s = u.getScheme() == null ? "" : u.getScheme();
        try {
            Intent i = s.equals("intent") ? Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME) : new Intent(Intent.ACTION_VIEW, u);
            i.addCategory(Intent.CATEGORY_BROWSABLE); i.setComponent(null); i.setSelector(null);
            startActivity(i);
        } catch (ActivityNotFoundException | java.net.URISyntaxException e) {
            if (!s.equals("intent")) return;
            try { String fb = Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME).getStringExtra("browser_fallback_url"); if (fb != null && fb.startsWith("http") && from != null) from.loadUrl(fb); } catch (Exception ignored) { }
        }
    }

    /* ---------------- default browser ---------------- */
    boolean isDefaultBrowser() { RoleManager r = getSystemService(RoleManager.class); return r != null && r.isRoleAvailable(RoleManager.ROLE_BROWSER) && r.isRoleHeld(RoleManager.ROLE_BROWSER); }
    void askDefaultBrowser() {
        RoleManager r = getSystemService(RoleManager.class);
        try {
            if (r != null && r.isRoleAvailable(RoleManager.ROLE_BROWSER) && !r.isRoleHeld(RoleManager.ROLE_BROWSER)) startActivityForResult(r.createRequestRoleIntent(RoleManager.ROLE_BROWSER), 9);
            else startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS));
        } catch (Exception ignored) { }
    }

    /* ---------------- files ---------------- */
    boolean chooseFile(ValueCallback<Uri[]> cb, WebChromeClient.FileChooserParams p) {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        fileCallback = cb;
        try { startActivityForResult(p.createIntent(), 7); return true; } catch (Exception e) { fileCallback = null; return false; }
    }
    /** The core's "open a file" (bookmark and password import): { name, text } or null when cancelled. */
    void pickTextFile(JSONObject m, Core.Reply done) {
        textFileDone = done; textFileMax = (long) m.optDouble("max", 50e6);
        try { startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*"), 8); }
        catch (Exception e) { textFileDone = null; done.done(true, null); }
    }
    @Override protected void onActivityResult(int req, int res, Intent data) {
        if (req == 7 && fileCallback != null) { fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data)); fileCallback = null; return; }
        if (req == 8 && textFileDone != null) {
            Core.Reply done = textFileDone; textFileDone = null;
            Uri u = res == RESULT_OK && data != null ? data.getData() : null;
            if (u == null) { done.done(true, null); return; }
            String name = u.getLastPathSegment() == null ? "file" : u.getLastPathSegment().replaceAll(".*/", "");
            try (InputStream in = getContentResolver().openInputStream(u)) {
                byte[] b = Assets.bytes(in);
                done.done(true, b.length < textFileMax ? new JSONObject().put("name", name).put("text", new String(b, StandardCharsets.UTF_8)) : new JSONObject().put("name", name).put("error", "Couldn’t read that file."));
            } catch (Exception e) { try { done.done(true, new JSONObject().put("name", name).put("error", "Couldn’t read that file.")); } catch (Exception ignored) { } }
            return;
        }
        super.onActivityResult(req, res, data);
    }

    /* ---------------- camera, microphone, location (after the site was allowed in the browser) ---------------- */
    void androidPermissions(List<String> kinds, Consumer<Boolean> done) {
        List<String> need = new ArrayList<>();
        for (String k : kinds) {
            String p = k.equals("camera") ? android.Manifest.permission.CAMERA : k.equals("microphone") ? android.Manifest.permission.RECORD_AUDIO : android.Manifest.permission.ACCESS_FINE_LOCATION;
            if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) need.add(p);
        }
        if (need.isEmpty()) { done.accept(true); return; }
        if (permissionDone != null) permissionDone.accept(false);
        permissionDone = done;
        requestPermissions(need.toArray(new String[0]), 11);
    }
    @Override public void onRequestPermissionsResult(int req, String[] perms, int[] results) {
        if (req != 11 || permissionDone == null) return;
        boolean ok = results.length > 0;
        for (int r : results) ok &= r == PackageManager.PERMISSION_GRANTED;
        Consumer<Boolean> d = permissionDone; permissionDone = null; d.accept(ok);
    }

    /* ---------------- full-screen video ---------------- */
    void showFullscreen(View v, WebChromeClient.CustomViewCallback cb) {
        if (fullscreen != null) hideFullscreen();
        fullscreen = v; fullscreenDone = cb;
        ((ViewGroup) getWindow().getDecorView()).addView(v, new FrameLayout.LayoutParams(-1, -1));
        v.setBackgroundColor(Color.BLACK);
        WindowInsetsController c = getWindow().getInsetsController();
        if (c != null) { c.hide(WindowInsets.Type.systemBars()); c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE); }
    }
    void hideFullscreen() {
        if (fullscreen == null) return;
        ((ViewGroup) getWindow().getDecorView()).removeView(fullscreen);
        fullscreen = null; fullscreenDone = null;
        WindowInsetsController c = getWindow().getInsetsController();
        if (c != null) c.show(WindowInsets.Type.systemBars());
    }

    @Override protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
        if (core != null) core.run("try { store.flushAll(); } catch (e) {}");
    }
    @Override protected void onDestroy() {
        for (Win w : new ArrayList<>(windows)) w.destroy();
        windows.clear();
        if (core != null) core.web.destroy();
        super.onDestroy();
    }
}
