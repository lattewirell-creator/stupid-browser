package com.emil.stupidbrowser;

import android.content.Context;
import android.content.SharedPreferences;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.HashSet;
import java.util.Set;

/** Blocks requests to known ad and tracker domains (assets/blocklist.txt, built from EasyList + EasyPrivacy). */
final class AdBlock {
    private final Set<String> hosts = new HashSet<>();
    private final SharedPreferences prefs;
    int blocked;

    AdBlock(Context c) {
        prefs = c.getSharedPreferences("stupid", Context.MODE_PRIVATE);
        new Thread(() -> {
            Set<String> s = new HashSet<>();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(c.getAssets().open("blocklist.txt")))) {
                for (String l; (l = r.readLine()) != null; ) if (!l.isEmpty()) s.add(l);
            } catch (Exception ignored) { }
            synchronized (hosts) { hosts.addAll(s); }
        }).start();
    }

    boolean on() { return prefs.getBoolean("adblock", true); }

    /** ads.example.com is blocked if ads.example.com or example.com is listed. */
    boolean blocks(String host) {
        if (host == null) return false;
        synchronized (hosts) {
            for (String h = host; ; ) {
                if (hosts.contains(h)) return true;
                int dot = h.indexOf('.');
                if (dot < 0 || h.indexOf('.', dot + 1) < 0) return false;
                h = h.substring(dot + 1);
            }
        }
    }
}
