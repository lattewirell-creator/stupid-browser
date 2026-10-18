package com.emil.stupidbrowser;

import android.content.Context;
import android.net.Uri;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/** The browser's own files, served to its web views from private https origins (the Mac app's app:// and
 *  stupid:// schemes; Android web views can't register schemes):
 *    https://shell.stupidapp.internal/…  → src/ (the UI)            https://core.stupidapp.internal/… → mac/core/
 *    https://settings.stupid.internal/…  → stupid://settings/ etc.  (src/pages, like the Electron protocol handler)
 *  ".internal" names never exist on the internet, so nothing here can be confused with a real site. */
final class Assets {
    static final String SHELL = "https://shell.stupidapp.internal", CORE = "https://core.stupidapp.internal";
    static final Set<String> PAGES = new HashSet<>(Arrays.asList("newtab", "settings", "history", "downloads", "bookmarks", "source", "welcome", "rewind"));
    /** The browser's own screens never zoom (only web pages do, with pinch or the ⋮ menu's Zoom). */
    static final float UI_SCALE = 1f;
    private static final String VIEWPORT = "<meta name=\"viewport\" content=\"width=device-width, initial-scale=" + UI_SCALE + ", minimum-scale=" + UI_SCALE
        + ", maximum-scale=" + UI_SCALE + ", user-scalable=no, viewport-fit=cover\">";
    private static final Map<String, String> text = new HashMap<>();
    private Assets() {}

    /* ---------------- stupid:// ↔ https://<page>.stupid.internal ---------------- */
    static String toWeb(String url) {
        if (url == null || !url.startsWith("stupid://")) return url;
        Uri u = Uri.parse(url);
        String host = u.getHost() == null ? "" : u.getHost();
        String rest = url.substring(("stupid://" + host).length());
        return "https://" + host + ".stupid.internal" + (rest.isEmpty() ? "/" : rest);
    }
    static String toUi(String url) {
        if (url == null) return "";
        Uri u = Uri.parse(url);
        String host = u.getHost();
        if (!"https".equals(u.getScheme()) || host == null || !host.endsWith(".stupid.internal")) return url;
        String page = host.substring(0, host.length() - ".stupid.internal".length());
        return "stupid://" + page + url.substring(url.indexOf(host) + host.length());
    }
    static boolean isPage(String url) { Uri u = url == null ? null : Uri.parse(url); return u != null && u.getHost() != null && u.getHost().endsWith(".stupid.internal") && "https".equals(u.getScheme()); }

    static String read(Context c, String path) {
        synchronized (text) {
            String t = text.get(path);
            if (t != null) return t;
            try (InputStream in = c.getAssets().open(path)) { t = new String(bytes(in), StandardCharsets.UTF_8); } catch (Exception e) { t = ""; }
            text.put(path, t);
            return t;
        }
    }
    static byte[] bytes(InputStream in) throws java.io.IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream(); byte[] b = new byte[32768]; int n;
        while ((n = in.read(b)) > 0) out.write(b, 0, n);
        return out.toByteArray();
    }

    /** Page helpers for every web page: mac/js scripts talking to __stupidTab instead of WebKit's handler. */
    static String helper(Context c, String name, boolean topOnly) {
        String s = read(c, "mac/" + name).replace("window.webkit.messageHandlers.tab.postMessage(", "__stupidTabPost(");
        return topOnly ? "if (window.top === window) {\n" + s + "\n}" : s;
    }
    static String shellScript(Context c) {
        return read(c, "android/shell-bridge.js") + "\n" + read(c, "mac/host-shell.js").replace("platform: \"darwin\"", "platform: \"android\"").replace("engine: \"webkit\"", "engine: \"android\"")
            + "\n" + read(c, "android/android-shell.js");
    }
    static String pageScript(Context c) {
        return read(c, "android/page-bridge.js") + "\n" + read(c, "mac/host-page.js").replace("if (location.protocol !== \"stupid:\") return;", "if (!/\\.stupid\\.internal$/.test(location.hostname) || !window.__stupidPageBridge) return;")
            .replace("platform: \"darwin\"", "platform: \"android\"").replace("engine: \"webkit\"", "engine: \"android\"");
    }

    /** Serves the UI, the core and our pages; null for everything else (the network). */
    static WebResourceResponse serve(Context c, Uri u, File dataDir) {
        String host = u.getHost();
        if (host == null || !"https".equals(u.getScheme())) return null;
        String path = u.getPath() == null || u.getPath().equals("/") ? "" : Uri.decode(u.getPath()).substring(1);
        if (path.contains("..")) return missing();
        if (host.equals("shell.stupidapp.internal")) {
            if (path.isEmpty()) path = "index.html";
            if (path.equals("__android/host.js")) return js(shellScript(c));
            if (path.equals("__android/android.css")) return file(c, "android/android.css");
            if (path.equals("index.html")) return html(read(c, "shell/index.html").replaceFirst("<head>", "<head>" + VIEWPORT + "<script src=\"/__android/host.js\"></script>")
                .replace("</head>", "<link rel=\"stylesheet\" href=\"/__android/android.css\"></head>"));
            return file(c, "shell/" + path);
        }
        if (host.equals("core.stupidapp.internal")) {
            if (path.isEmpty()) path = "core.html";
            if (path.equals("__android/bridge.js")) return file(c, "android/core-bridge.js");
            if (path.equals("core.html")) return html(read(c, "core/core.html").replace("<script src=\"core-shims.js\">", "<script src=\"/__android/bridge.js\"></script><script src=\"core-shims.js\">"));
            return file(c, "core/" + path);
        }
        if (host.endsWith(".stupid.internal")) {
            String page = host.substring(0, host.length() - ".stupid.internal".length());
            if (!PAGES.contains(page)) return missing();
            if (path.equals("__android/page.js")) return js(pageScript(c));
            if (path.equals("__android/android.css")) return file(c, "android/pages.css");
            // Rewind thumbnails (stupid://rewind/thumbs/<id>.jpg) come from the data folder.
            if (page.equals("rewind") && path.matches("^thumbs/[a-z0-9]{6,20}\\.jpg$")) {
                try { return new WebResourceResponse("image/jpeg", null, 200, "OK", headers(), new FileInputStream(new File(new File(dataDir, "rewind"), path.substring(7)))); } catch (Exception e) { return missing(); }
            }
            if (path.isEmpty()) path = page + ".html";
            String base = path.startsWith("fonts/") || path.startsWith("assets/") ? "shell/" : "shell/pages/";
            if (path.endsWith(".html")) {
                String h = read(c, base + path);
                if (h.isEmpty()) return missing();
                return html(h.replaceFirst("(?i)<head>", "<head>" + VIEWPORT + "<script src=\"/__android/page.js\"></script>").replace("</head>", "<link rel=\"stylesheet\" href=\"/__android/android.css\"></head>"));
            }
            return file(c, base + path);
        }
        return null;
    }

    static Map<String, String> headers() { Map<String, String> h = new HashMap<>(); h.put("Cache-Control", "no-cache"); h.put("X-Content-Type-Options", "nosniff"); return h; }
    static WebResourceResponse missing() { return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", headers(), new ByteArrayInputStream(new byte[0])); }
    static WebResourceResponse empty() { return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0])); }
    private static WebResourceResponse js(String s) { return new WebResourceResponse("text/javascript", "utf-8", 200, "OK", headers(), new ByteArrayInputStream(s.getBytes(StandardCharsets.UTF_8))); }
    private static WebResourceResponse html(String s) { return new WebResourceResponse("text/html", "utf-8", 200, "OK", headers(), new ByteArrayInputStream(s.getBytes(StandardCharsets.UTF_8))); }
    private static WebResourceResponse file(Context c, String path) {
        try {
            InputStream in = c.getAssets().open(path);
            String t = type(path);
            return new WebResourceResponse(t, t.startsWith("text/") || t.endsWith("json") || t.endsWith("javascript") ? "utf-8" : null, 200, "OK", headers(), in);
        } catch (Exception e) { return missing(); }
    }
    static String type(String p) {
        String e = p.substring(p.lastIndexOf('.') + 1).toLowerCase();
        switch (e) {
            case "html": return "text/html"; case "js": case "mjs": return "text/javascript"; case "css": return "text/css"; case "json": return "application/json";
            case "svg": return "image/svg+xml"; case "png": return "image/png"; case "jpg": case "jpeg": return "image/jpeg"; case "webp": return "image/webp"; case "gif": return "image/gif";
            case "woff2": return "font/woff2"; case "woff": return "font/woff"; case "ttf": return "font/ttf"; case "otf": return "font/otf";
            case "mp3": return "audio/mpeg"; case "wav": return "audio/wav"; case "ogg": return "audio/ogg"; case "mp4": return "video/mp4"; case "webm": return "video/webm";
            case "glb": return "model/gltf-binary"; case "wasm": return "application/wasm"; case "ico": return "image/x-icon";
            default: return "application/octet-stream";
        }
    }
}
