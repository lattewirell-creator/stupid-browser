# The UI and core call these through Android's JavaScript bridge; the annotation must survive for WebView to expose them.
-keepattributes RuntimeVisibleAnnotations
-keep class com.emil.stupidbrowser.Core { @android.webkit.JavascriptInterface public <methods>; }
-keep class com.emil.stupidbrowser.Win$Bridge { @android.webkit.JavascriptInterface public <methods>; }
