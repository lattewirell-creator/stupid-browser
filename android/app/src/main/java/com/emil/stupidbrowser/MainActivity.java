package com.emil.stupidbrowser;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;

import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.List;

/** The Stupid Browser for Android: a calm WebView browser with tabs, a new-tab page and a built-in ad blocker. */
public class MainActivity extends Activity {
    static final String HOME = "file:///android_asset/newtab.html";
    static final String[][] ENGINES = {
            {"DuckDuckGo", "https://duckduckgo.com/?q=%s"}, {"Google", "https://www.google.com/search?q=%s"},
            {"Brave Search", "https://search.brave.com/search?q=%s"}, {"Bing", "https://www.bing.com/search?q=%s"},
            {"Startpage", "https://www.startpage.com/do/search?q=%s"}, {"Ecosia", "https://www.ecosia.org/search?q=%s"},
            {"Reddit", "https://www.reddit.com/search/?q=%s"}};

    final List<WebView> tabs = new ArrayList<>();
    WebView current;
    FrameLayout content;
    EditText address;
    TextView tabCount;
    ProgressBar progress;
    SharedPreferences prefs;
    AdBlock adblock;
    ValueCallback<Uri[]> fileCallback;
    View fullscreenView;
    int accent, bg, bar, text, muted;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        prefs = getSharedPreferences("stupid", MODE_PRIVATE);
        adblock = new AdBlock(this);
        boolean dark = (getResources().getConfiguration().uiMode & android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES;
        accent = Color.parseColor("#D97757");
        bg = Color.parseColor(dark ? "#1E1C19" : "#F7F4EE");
        bar = Color.parseColor(dark ? "#2A2724" : "#EFEAE1");
        text = Color.parseColor(dark ? "#EEE9E0" : "#2B2824");
        muted = Color.parseColor(dark ? "#A39D93" : "#7D776D");
        buildUi();
        if (!restoreTabs()) newTab(HOME);
        handleIntent(getIntent());
    }

    int dp(float v) { return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()); }

    GradientDrawable pill(int color, float radius) { GradientDrawable d = new GradientDrawable(); d.setColor(color); d.setCornerRadius(dp(radius)); return d; }

    TextView barButton(String label, View.OnClickListener l) {
        TextView b = new TextView(this);
        b.setText(label); b.setTextColor(text); b.setTextSize(20); b.setGravity(Gravity.CENTER);
        b.setLayoutParams(new LinearLayout.LayoutParams(dp(44), dp(44)));
        b.setOnClickListener(l);
        TypedValue tv = new TypedValue(); getTheme().resolveAttribute(android.R.attr.selectableItemBackgroundBorderless, tv, true); b.setBackgroundResource(tv.resourceId);
        return b;
    }

    void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(bar);
        content = new FrameLayout(this);
        content.setBackgroundColor(bg);
        root.addView(content, new LinearLayout.LayoutParams(-1, 0, 1));
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100); progress.setProgressTintList(android.content.res.ColorStateList.valueOf(accent));
        progress.setVisibility(View.INVISIBLE);
        root.addView(progress, new LinearLayout.LayoutParams(-1, dp(3)));

        // Bottom bar (easier to reach with a thumb): back · address · tabs · menu
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(dp(6), dp(6), dp(6), dp(6));
        row.addView(barButton("‹", v -> { if (current != null && current.canGoBack()) current.goBack(); }));
        address = new EditText(this);
        address.setSingleLine(true);
        address.setHint("Search or type a web address");
        address.setTextSize(15); address.setTextColor(text); address.setHintTextColor(muted);
        address.setBackground(pill(bg, 22));
        address.setPadding(dp(16), 0, dp(16), 0);
        address.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        address.setImeOptions(EditorInfo.IME_ACTION_GO);
        address.setSelectAllOnFocus(true);
        address.setOnEditorActionListener((v, id, ev) -> { go(address.getText().toString()); return true; });
        address.setOnFocusChangeListener((v, f) -> { if (!f) showUrl(); });
        LinearLayout.LayoutParams ap = new LinearLayout.LayoutParams(0, dp(44), 1); ap.setMargins(dp(4), 0, dp(4), 0);
        row.addView(address, ap);
        tabCount = barButton("1", v -> showTabs());
        tabCount.setTextSize(13); tabCount.setTypeface(Typeface.DEFAULT_BOLD);
        GradientDrawable box = new GradientDrawable(); box.setStroke(dp(1.6f), text); box.setCornerRadius(dp(6));
        FrameLayout tabWrap = new FrameLayout(this);
        View outline = new View(this); outline.setBackground(box);
        tabWrap.addView(outline, new FrameLayout.LayoutParams(dp(24), dp(24), Gravity.CENTER));
        tabWrap.addView(tabCount, new FrameLayout.LayoutParams(dp(44), dp(44)));
        row.addView(tabWrap, new LinearLayout.LayoutParams(dp(44), dp(44)));
        row.addView(barButton("⋯", v -> showMenu()));
        root.addView(row);

        // Edge-to-edge: keep the bar above the gesture area and the keyboard.
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            android.graphics.Insets s = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
            v.setPadding(s.left, s.top, s.right, s.bottom);
            return WindowInsets.CONSUMED;
        });
        getWindow().setStatusBarColor(bg);
        setContentView(root);
    }

    // ---------------------------------------------------------------- tabs
    @SuppressLint("SetJavaScriptEnabled")
    WebView newTab(String url) {
        WebView wv = new WebView(this);
        WebSettings s = wv.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setSupportMultipleWindows(true);
        s.setBuiltInZoomControls(true); s.setDisplayZoomControls(false);
        s.setLoadWithOverviewMode(true); s.setUseWideViewPort(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setAllowFileAccess(false);    // the bundled new-tab page is an asset, which still loads
        wv.setBackgroundColor(bg);
        CookieManager.getInstance().setAcceptThirdPartyCookies(wv, false);
        wv.addJavascriptInterface(new Bridge(wv), "Stupid");
        wv.setWebViewClient(new Client());
        wv.setWebChromeClient(new Chrome());
        wv.setDownloadListener((u, ua, disposition, mime, len) -> download(u, ua, disposition, mime));
        tabs.add(wv);
        show(wv);
        wv.loadUrl(url);
        return wv;
    }

    void show(WebView wv) {
        current = wv;
        content.removeAllViews();
        content.addView(wv, new FrameLayout.LayoutParams(-1, -1));
        wv.onResume();
        for (WebView o : tabs) if (o != wv) o.onPause();   // background tabs stop timers & media
        tabCount.setText(String.valueOf(tabs.size()));
        showUrl();
    }

    void closeTab(WebView wv) {
        int i = tabs.indexOf(wv);
        tabs.remove(wv);
        wv.destroy();
        if (tabs.isEmpty()) newTab(HOME);
        else if (wv == current) show(tabs.get(Math.max(0, i - 1)));
        else tabCount.setText(String.valueOf(tabs.size()));
    }

    void showTabs() {
        List<String> names = new ArrayList<>();
        for (WebView w : tabs) names.add((w == current ? "● " : "") + label(w));
        names.add("＋  New tab");
        new AlertDialog.Builder(this).setTitle(tabs.size() + (tabs.size() == 1 ? " tab" : " tabs"))
                .setItems(names.toArray(new String[0]), (d, i) -> { if (i == tabs.size()) newTab(HOME); else show(tabs.get(i)); })
                .setNeutralButton("Close this tab", (d, i) -> closeTab(current))
                .setNegativeButton("Close all", (d, i) -> { for (WebView w : new ArrayList<>(tabs)) { tabs.remove(w); w.destroy(); } newTab(HOME); })
                .show();
    }

    String label(WebView w) {
        String u = w.getUrl();
        if (u == null || u.startsWith("file:")) return "New tab";
        String t = w.getTitle();
        return t != null && !t.isEmpty() ? t : u;
    }

    void showUrl() {
        if (address.hasFocus() || current == null) return;
        String u = current.getUrl();
        address.setText(u == null || u.startsWith("file:") ? "" : Uri.parse(u).getHost() != null ? Uri.parse(u).getHost().replaceFirst("^www\\.", "") : u);
    }

    // ---------------------------------------------------------------- navigation
    String searchUrl() { int i = prefs.getInt("engine", 0); return ENGINES[Math.max(0, Math.min(ENGINES.length - 1, i))][1]; }

    String toUrl(String q) {
        q = q.trim();
        if (q.isEmpty()) return HOME;
        if (q.matches("(?i)^(https?|file|about|data):.*")) return q.startsWith("file:") ? HOME : q;
        if (!q.contains(" ") && q.matches("^[\\w-]+(\\.[\\w-]+)+(:\\d+)?(/.*)?$")) return "https://" + q;
        if (q.matches("^localhost(:\\d+)?(/.*)?$")) return "http://" + q;
        return searchUrl().replace("%s", Uri.encode(q));
    }

    void go(String q) {
        current.loadUrl(toUrl(q));
        address.clearFocus();
        ((InputMethodManager) getSystemService(INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(address.getWindowToken(), 0);
        current.requestFocus();
    }

    @Override protected void onNewIntent(Intent intent) { super.onNewIntent(intent); handleIntent(intent); }

    void handleIntent(Intent i) {
        if (i == null) return;
        if (Intent.ACTION_VIEW.equals(i.getAction()) && i.getData() != null) newTab(i.getDataString());
        else if (Intent.ACTION_SEND.equals(i.getAction()) && i.getStringExtra(Intent.EXTRA_TEXT) != null) newTab(toUrl(i.getStringExtra(Intent.EXTRA_TEXT)));
        else if (Intent.ACTION_WEB_SEARCH.equals(i.getAction()) && i.getStringExtra("query") != null) newTab(toUrl(i.getStringExtra("query")));
    }

    @Override public boolean onKeyDown(int code, KeyEvent e) {
        if (code == KeyEvent.KEYCODE_BACK) {
            if (fullscreenView != null) { ((Chrome) chromeOf()).onHideCustomView(); return true; }
            if (current != null && current.canGoBack()) { current.goBack(); return true; }
            if (tabs.size() > 1) { closeTab(current); return true; }
        }
        return super.onKeyDown(code, e);
    }
    WebChromeClient chromeOf() { return current.getWebChromeClient(); }

    // ---------------------------------------------------------------- menu & settings
    void showMenu() {
        String[] items = {"New tab", "Reload", "Forward", "Share page", "Find on page", "Search engine", "Ad blocker: " + (adblock.on() ? "on (" + adblock.blocked + " blocked)" : "off"), "Your name", "Clear browsing data", "About"};
        new AlertDialog.Builder(this).setItems(items, (d, i) -> {
            switch (i) {
                case 0: newTab(HOME); break;
                case 1: current.reload(); break;
                case 2: if (current.canGoForward()) current.goForward(); break;
                case 3: share(); break;
                case 4: findOnPage(); break;
                case 5: pickEngine(); break;
                case 6: prefs.edit().putBoolean("adblock", !adblock.on()).apply(); current.reload(); toast("Ad blocker " + (adblock.on() ? "on" : "off")); break;
                case 7: askName(); break;
                case 8: clearData(); break;
                case 9: new AlertDialog.Builder(this).setTitle("The Stupid Browser").setMessage("Version " + BuildConfigLite.version(this) + "\nA calm little browser.\ngithub.com/lattewirell-creator/stupid-browser").setPositiveButton("OK", null).show(); break;
            }
        }).show();
    }

    void share() {
        String u = current.getUrl(); if (u == null || u.startsWith("file:")) return;
        Intent s = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, u);
        startActivity(Intent.createChooser(s, "Share page"));
    }

    void findOnPage() {
        EditText in = new EditText(this); in.setSingleLine(true); in.setHint("Find on page");
        new AlertDialog.Builder(this).setView(in).setPositiveButton("Find", (d, i) -> current.findAllAsync(in.getText().toString()))
                .setNeutralButton("Next", (d, i) -> { current.findAllAsync(in.getText().toString()); current.findNext(true); })
                .setNegativeButton("Clear", (d, i) -> current.clearMatches()).show();
    }

    void pickEngine() {
        String[] names = new String[ENGINES.length]; for (int i = 0; i < ENGINES.length; i++) names[i] = ENGINES[i][0];
        new AlertDialog.Builder(this).setTitle("Search engine").setSingleChoiceItems(names, prefs.getInt("engine", 0), (d, i) -> { prefs.edit().putInt("engine", i).apply(); d.dismiss(); }).show();
    }

    void askName() {
        EditText in = new EditText(this); in.setSingleLine(true); in.setText(prefs.getString("name", ""));
        new AlertDialog.Builder(this).setTitle("What should we call you?").setView(in)
                .setPositiveButton("Save", (d, i) -> { prefs.edit().putString("name", in.getText().toString().trim()).apply(); if (isHome(current)) current.reload(); }).show();
    }

    void clearData() {
        new AlertDialog.Builder(this).setTitle("Clear browsing data?").setMessage("History, cookies, site data and cache. You'll be signed out of websites.")
                .setPositiveButton("Clear", (d, i) -> {
                    CookieManager.getInstance().removeAllCookies(null);
                    WebStorage.getInstance().deleteAllData();
                    for (WebView w : tabs) { w.clearCache(true); w.clearHistory(); }
                    toast("Cleared");
                }).setNegativeButton("Cancel", null).show();
    }

    void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_SHORT).show(); }

    static boolean isHome(WebView w) { String u = w.getUrl(); return u != null && u.startsWith(HOME); }

    // ---------------------------------------------------------------- downloads
    void download(String url, String ua, String disposition, String mime) {
        try {
            String name = URLUtil.guessFileName(url, disposition, mime);
            DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
            r.setMimeType(mime);
            r.addRequestHeader("User-Agent", ua);
            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null) r.addRequestHeader("Cookie", cookies);
            r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(r);
            toast("Downloading " + name);
        } catch (Exception e) { toast("Couldn't download that"); }
    }

    @Override protected void onActivityResult(int req, int res, Intent data) {
        if (req == 7 && fileCallback != null) { fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data)); fileCallback = null; }
        super.onActivityResult(req, res, data);
    }

    // ---------------------------------------------------------------- remember tabs
    @Override protected void onPause() {
        super.onPause();
        JSONArray a = new JSONArray();
        for (WebView w : tabs) { String u = w.getUrl(); a.put(u == null || u.startsWith("file:") ? HOME : u); }
        prefs.edit().putString("tabs", a.toString()).putInt("current", Math.max(0, tabs.indexOf(current))).apply();
        CookieManager.getInstance().flush();
    }

    boolean restoreTabs() {
        try {
            JSONArray a = new JSONArray(prefs.getString("tabs", "[]"));
            if (a.length() == 0) return false;
            for (int i = 0; i < a.length() && i < 30; i++) newTab(a.getString(i));
            show(tabs.get(Math.min(prefs.getInt("current", 0), tabs.size() - 1)));
            return true;
        } catch (Exception e) { return false; }
    }

    // ---------------------------------------------------------------- web view clients
    class Client extends WebViewClient {
        @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
            Uri u = r.getUrl(); String s = u.getScheme();
            if ("http".equals(s) || "https".equals(s) || "about".equals(s) || "data".equals(s)) return false;
            if ("file".equals(s)) return !u.toString().startsWith(HOME);
            try {   // mailto:, tel:, intent:, app links → other apps
                Intent i = "intent".equals(s) ? Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME) : new Intent(Intent.ACTION_VIEW, u);
                i.addCategory(Intent.CATEGORY_BROWSABLE); i.setComponent(null); i.setSelector(null);
                startActivity(i);
            } catch (ActivityNotFoundException | java.net.URISyntaxException e) {
                if ("intent".equals(s)) { try { String fb = Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME).getStringExtra("browser_fallback_url"); if (fb != null && fb.startsWith("http")) v.loadUrl(fb); } catch (Exception ignored) { } }
            }
            return true;
        }
        @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
            if (!r.isForMainFrame() && adblock.on() && adblock.blocks(r.getUrl().getHost())) {
                adblock.blocked++;
                return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
            }
            return null;
        }
        @Override public void onPageStarted(WebView v, String url, Bitmap fav) { if (v == current) { progress.setVisibility(View.VISIBLE); showUrl(); } }
        @Override public void onPageFinished(WebView v, String url) { if (v == current) { progress.setVisibility(View.INVISIBLE); showUrl(); } }
        @Override public void doUpdateVisitedHistory(WebView v, String url, boolean reload) { if (v == current) showUrl(); }
    }

    class Chrome extends WebChromeClient {
        int prevFlags;
        @Override public void onProgressChanged(WebView v, int p) { if (v == current) { progress.setProgress(p); progress.setVisibility(p < 100 ? View.VISIBLE : View.INVISIBLE); } }
        @Override public boolean onCreateWindow(WebView v, boolean dialog, boolean gesture, android.os.Message msg) {
            if (!gesture) return false;   // no pop-ups the user didn't click for
            WebView nw = newTab("about:blank");
            ((WebView.WebViewTransport) msg.obj).setWebView(nw);
            msg.sendToTarget();
            return true;
        }
        @Override public void onCloseWindow(WebView w) { if (tabs.contains(w)) closeTab(w); }
        @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = cb;
            try { startActivityForResult(p.createIntent(), 7); } catch (Exception e) { fileCallback = null; return false; }
            return true;
        }
        @Override public void onShowCustomView(View view, CustomViewCallback cb) {   // full-screen video
            fullscreenView = view;
            ViewGroup decor = (ViewGroup) getWindow().getDecorView();
            decor.addView(view, new FrameLayout.LayoutParams(-1, -1));
            view.setBackgroundColor(Color.BLACK);
            getWindow().getInsetsController().hide(WindowInsets.Type.systemBars());
        }
        @Override public void onHideCustomView() {
            if (fullscreenView == null) return;
            ((ViewGroup) getWindow().getDecorView()).removeView(fullscreenView);
            fullscreenView = null;
            getWindow().getInsetsController().show(WindowInsets.Type.systemBars());
        }
    }

    /** Read-only info for the bundled new-tab page. Answers only when the tab shows that page. */
    class Bridge {
        final WebView wv; volatile boolean home;
        Bridge(WebView wv) { this.wv = wv; }
        boolean onHome() { final boolean[] r = {false}; final Object lock = new Object();
            synchronized (lock) { wv.post(() -> { synchronized (lock) { r[0] = isHome(wv); lock.notify(); } }); try { lock.wait(500); } catch (InterruptedException ignored) { } }
            return r[0]; }
        @JavascriptInterface public String name() { return onHome() ? prefs.getString("name", "") : ""; }
        @JavascriptInterface public String searchUrl() { return onHome() ? MainActivity.this.searchUrl() : ""; }
    }
}
