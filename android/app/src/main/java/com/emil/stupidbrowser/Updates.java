package com.emil.stupidbrowser;

import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** Updates: a newer APK on the project's GitHub releases (the app isn't in the Play Store). Shown in Settings
 *  like the desktop updater; "install" downloads the APK, which you open to update. */
final class Updates {
    private final MainActivity app;
    private final Handler main = new Handler(Looper.getMainLooper());
    private String apk;

    Updates(MainActivity app) { this.app = app; }

    private void push(JSONObject patch) { app.core.invoke("update:push", new JSONArray().put(patch), new JSONObject(), null); }

    void check(boolean now) {
        SharedPreferences p = app.getSharedPreferences("stupid", MainActivity.MODE_PRIVATE);
        long t = System.currentTimeMillis();
        if (!now && t - p.getLong("updateChecked", 0) < 6 * 3600_000L) return;
        p.edit().putLong("updateChecked", t).apply();
        try { push(new JSONObject().put("status", "checking")); } catch (Exception ignored) { }
        String current = BuildConfigLite.version(app);
        new Thread(() -> {
            JSONObject patch = new JSONObject();
            try {
                HttpURLConnection c = (HttpURLConnection) new URL("https://api.github.com/repos/lattewirell-creator/stupid-browser/releases/latest").openConnection();
                c.setConnectTimeout(15000); c.setReadTimeout(15000);
                c.setRequestProperty("Accept", "application/vnd.github+json");
                String body;
                try (InputStream in = c.getInputStream()) { body = new String(Assets.bytes(in), StandardCharsets.UTF_8); }
                JSONObject rel = new JSONObject(body);
                String version = rel.optString("tag_name").replaceFirst("^v", "");
                JSONArray assets = rel.optJSONArray("assets");
                String found = null;
                for (int i = 0; assets != null && i < assets.length(); i++) {
                    JSONObject a = assets.getJSONObject(i);
                    String url = a.optString("browser_download_url");
                    if (a.optString("name").endsWith("-android.apk") && url.startsWith("https://github.com/lattewirell-creator/stupid-browser/releases/download/")) found = url;
                }
                patch.put("lastCheck", System.currentTimeMillis());
                if (found != null && newer(version, current)) { apk = found; patch.put("status", "ready").put("version", version); }
                else patch.put("status", "none");
            } catch (Exception e) {
                try { patch.put("status", "error").put("error", "no connection").put("lastCheck", System.currentTimeMillis()); } catch (Exception ignored) { }
            }
            main.post(() -> push(patch));
        }).start();
    }

    boolean install() {
        if (apk == null) return false;
        Win w = app.current();
        if (w != null) w.tabs.openUrl(apk);
        return true;
    }

    static boolean newer(String a, String b) {
        String[] x = a.split("\\."), y = b.split("\\.");
        for (int i = 0; i < Math.max(x.length, y.length); i++) {
            int p, q;
            try { p = i < x.length ? Integer.parseInt(x[i].replaceAll("\\D.*", "")) : 0; q = i < y.length ? Integer.parseInt(y[i].replaceAll("\\D.*", "")) : 0; } catch (NumberFormatException e) { return false; }
            if (p != q) return p > q;
        }
        return false;
    }
}
