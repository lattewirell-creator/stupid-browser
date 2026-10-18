/* The Stupid Browser for Android: what the Mac app's WKScriptMessageHandler gives the UI, over Android's
 * JavaScript bridge. Loaded first in the browser UI (src/index.html), before mac/js/host-shell.js. */
window.webkit = { messageHandlers: { host: { postMessage: (m) => StupidHostNative.post(JSON.stringify(m)) } } };
document.documentElement.classList.add("android");
