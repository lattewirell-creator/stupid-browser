package com.emil.stupidbrowser;

import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.Map;

/** Downloads through Android's download service (saved in Downloads, with its notification), reported to the
 *  core like the Mac app's Downloads.swift so the desktop Downloads page and toolbar ring work the same. */
final class Downloads {
    private final MainActivity app;
    private final DownloadManager dm;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Map<String, Long> ids = new HashMap<>();      // our id -> DownloadManager id
    private final Map<String, Win> from = new HashMap<>();
    private int seq = 0;

    Downloads(MainActivity app) { this.app = app; dm = (DownloadManager) app.getSystemService(Context.DOWNLOAD_SERVICE); }

    /** A page's link or response that should be saved (WebView's DownloadListener). */
    void fromPage(String url, String ua, String disposition, String mime, long length, Win win) {
        enqueue(url, ua, URLUtil.guessFileName(url, disposition, mime), mime, length, win);
    }
    /** "Download link / image" from the page menu. */
    void start(String url, WebView web, Win win) {
        if (url == null || !url.startsWith("http")) return;
        enqueue(url, web == null ? null : web.getSettings().getUserAgentString(), URLUtil.guessFileName(url, null, null), null, -1, win);
    }

    private void enqueue(String url, String ua, String name, String mime, long length, Win win) {
        try {
            DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
            if (mime != null) r.setMimeType(mime);
            if (ua != null) r.addRequestHeader("User-Agent", ua);
            String cookies = win != null && win.incognito ? null : CookieManager.getInstance().getCookie(url);
            if (cookies != null) r.addRequestHeader("Cookie", cookies);
            r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            long dmId = dm.enqueue(r);
            String id = Long.toString(System.currentTimeMillis(), 36) + "-" + (++seq);
            ids.put(id, dmId); from.put(id, win);
            JSONObject rec = new JSONObject().put("id", id).put("filename", name).put("url", url).put("savePath", Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS) + "/" + name).put("total", Math.max(0, length));
            app.core.invoke("dl:event", new JSONArray().put(new JSONObject().put("kind", "start").put("rec", rec)), ctx(win), null);
            main.postDelayed(() -> poll(id), 500);
        } catch (Exception e) {
            if (win != null) win.emit("toast", new JSONArray().put("Couldn’t download that"));
        }
    }
    private JSONObject ctx(Win w) { return w != null ? w.ctx() : new JSONObject(); }

    private void poll(String id) {
        Long dmId = ids.get(id); if (dmId == null) return;
        try (Cursor c = dm.query(new DownloadManager.Query().setFilterById(dmId))) {
            JSONObject patch = new JSONObject();
            boolean more = true;
            if (c == null || !c.moveToFirst()) { patch.put("state", "cancelled"); more = false; }
            else {
                int status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                long got = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)), total = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                patch.put("received", got).put("total", Math.max(0, total));
                if (status == DownloadManager.STATUS_SUCCESSFUL) { patch.put("state", "completed"); more = false; }
                else if (status == DownloadManager.STATUS_FAILED) { patch.put("state", "interrupted"); more = false; }
                else patch.put("state", "progressing").put("paused", status == DownloadManager.STATUS_PAUSED);
            }
            app.core.invoke("dl:event", new JSONArray().put(new JSONObject().put("kind", "update").put("id", id).put("patch", patch)), ctx(from.get(id)), null);
            if (more) main.postDelayed(() -> poll(id), 700); else from.remove(id);
        } catch (Exception ignored) { }
    }

    /** downloads:action from the core. */
    void op(JSONObject m, Core.Reply done) {
        String act = m.optString("act");
        Long dmId = ids.get(m.optString("id"));
        switch (act) {
            case "open": {
                Uri u = dmId == null ? null : dm.getUriForDownloadedFile(dmId);
                if (u == null) { show(); done.done(true, true); return; }
                try { app.startActivity(new Intent(Intent.ACTION_VIEW).setDataAndType(u, dm.getMimeTypeForDownloadedFile(dmId)).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)); done.done(true, true); }
                catch (ActivityNotFoundException e) { done.done(true, false); }
                return;
            }
            case "show": show(); done.done(true, true); return;
            case "start": { String u = m.optString("url"); if (!u.startsWith("http")) { done.done(true, false); return; } start(u, null, app.current()); done.done(true, true); return; }
            case "cancel": if (dmId != null) dm.remove(dmId); done.done(true, dmId != null); return;
            default: done.done(true, false);   // pause / resume: Android's download service does that itself
        }
    }
    private void show() { try { app.startActivity(new Intent(DownloadManager.ACTION_VIEW_DOWNLOADS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception ignored) { } }
}
