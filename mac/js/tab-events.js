/* The Stupid Browser for Mac: runs in every tab (top frame) and reports what Electron's <webview>
 * reports on its own: page ready, the site's icons, the link under the pointer, focus. */
(() => {
  "use strict";
  const post = (m) => { try { window.webkit.messageHandlers.tab.postMessage(m); } catch {} };
  const icons = () => {
    const list = [...document.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]')].map((l) => l.href).filter((h) => /^(https?|data):/.test(h));
    if (!list.length && /^https?:$/.test(location.protocol)) list.push(location.origin + "/favicon.ico");
    post({ type: "favicons", list });
  };
  document.addEventListener("DOMContentLoaded", () => { post({ type: "dom-ready" }); icons(); });
  addEventListener("load", icons);
  let lastHref = "";
  document.addEventListener("mouseover", (e) => {
    const a = e.target.closest && e.target.closest("a[href]");
    const href = a ? a.href : "";
    if (href !== lastHref) { lastHref = href; post({ type: "target-url", url: href }); }
  }, true);
  // The UI only needs to know when the tab gains focus, not about every focus change inside the page.
  let focused = false;
  const gained = () => { if (!focused) { focused = true; post({ type: "focus" }); } };
  addEventListener("focus", gained, true);
  addEventListener("mousedown", gained, true);
  addEventListener("blur", (e) => { if (e.target === window) focused = false; });
})();
