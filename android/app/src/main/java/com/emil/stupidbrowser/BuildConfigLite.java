package com.emil.stupidbrowser;

import android.content.Context;

final class BuildConfigLite {
    static String version(Context c) {
        try { return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionName; } catch (Exception e) { return "?"; }
    }
}
