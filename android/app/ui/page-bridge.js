/* The Stupid Browser for Android: window.stupid for our own pages (settings, new tab…). __stupidPageBridge
 * only exists on *.stupid.internal pages (the app's origin rule), so no website can reach the core. */
(() => {
  if (!/\.stupid\.internal$/.test(location.hostname) || !window.__stupidPageBridge) return;
  window.webkit = { messageHandlers: { page: { postMessage: (m) => __stupidPageBridge.postMessage(JSON.stringify(m)) } } };
  document.documentElement.classList.add("android");
})();
