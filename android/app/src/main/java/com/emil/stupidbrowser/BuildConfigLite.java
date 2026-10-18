package com.emil.stupidbrowser;

import android.content.Context;
import android.content.pm.ApplicationInfo;

final class BuildConfigLite {
    static String version(Context c) {
        try { return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionName; } catch (Exception e) { return "?"; }
    }
    /** Debug builds can be inspected from a computer's Chrome (chrome://inspect); release builds can't. */
    static boolean debuggable(Context c) { return (c.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0; }
}
