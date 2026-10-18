/* The Stupid Browser for Mac (WebKit): runs before the browser UI (src/index.html) in the window.
 * It gives the UI exactly what Electron's preload and <webview> give it, so renderer.js and the other
 * UI scripts run unchanged:
 *   window.stupid  { platform, invoke(channel, …), on(event, fn) }   (like src/preload.js)
 *   <webview>      a stand-in element; the real tab is a native WKWebView the Mac app keeps exactly
 *                  where this element is on screen (behind the UI, which is transparent there).
 * Messages go to the Mac app through window.webkit.messageHandlers.host. */
(() => {
  "use strict";
  const post = msg => window.webkit.messageHandlers.host.postMessage(msg);
  // Errors in the UI show up in the app's log (like Electron's console).
  addEventListener("error", (e) => post({ type: "log", text: `${e.message} (${(e.filename || "").split("/").pop()}:${e.lineno})` }));
  addEventListener("unhandledrejection", (e) => post({ type: "log", text: "unhandled: " + (e.reason && e.reason.message || e.reason) }));
  let seq = 0;
  const pending = new Map();
  const listeners = new Map();
  const request = (msg) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); post(Object.assign({ id }, msg)); });

  window.stupid = Object.freeze({
    platform: "darwin",
    engine: "webkit",
    invoke: (channel, ...args) => request({ type: "invoke", channel, args }),
    on: (channel, fn) => { (listeners.get(channel) || listeners.set(channel, []).get(channel)).push(fn); },
  });

  // The native tab sits behind the UI: the stand-in and the area around it must not paint over it.
  const style = document.createElement("style");
  // The window frame (its colour, tint, glass) is painted natively behind everything, so the page can show through.
  style.textContent = "html, body, #app, webview, #views { background: transparent !important; } webview { display: none; } webview.visible, webview.spare { display: flex; }"
    // Liquid Glass (Settings → Appearance): the classic look's bars let the glass through too.
    + " html.mac-glass #titlebar, html.mac-glass #toolbar, html.mac-glass #bookmarksBar, html.mac-glass #rail, html.mac-glass #vtabs { background: transparent !important; }";
  (document.head || document.documentElement).appendChild(style);
  document.addEventListener("DOMContentLoaded", () => document.head.appendChild(style));

  /* ---------------- <webview> stand-in ---------------- */
  const views = new Map();   // tab id -> element
  let nextTab = 1;
  // "webview" has no hyphen, so it can't be a registered custom element: document.createElement("webview")
  // gets these methods instead, and a MutationObserver plays connectedCallback/disconnectedCallback.
  class StupidWebview extends HTMLElement {
    _init() {
      this._tab = nextTab++;
      this._url = ""; this._title = ""; this._canBack = false; this._canFwd = false; this._zoom = 1; this._audible = false; this._loading = false;
      this._made = false;
    }
    setAttribute(name, value) { HTMLElement.prototype.setAttribute.call(this, name, value); this.attributeChangedCallback(String(name).toLowerCase(), null, String(value)); }
    connectedCallback() {
      views.set(this._tab, this);
      if (!this._made) {
        this._made = true;
        post({ type: "tab:create", tab: this._tab, url: this.getAttribute("src") || "about:blank", partition: this.getAttribute("partition") || "", popups: this.hasAttribute("allowpopups") });
      }
      scheduleLayout();
    }
    disconnectedCallback() {
      // Electron destroys the webview when it leaves the DOM; renderer.js re-inserts elements only by
      // moving them within the same tick, so wait a frame before closing the native tab.
      requestAnimationFrame(() => { if (!this.isConnected) { views.delete(this._tab); post({ type: "tab:destroy", tab: this._tab }); } else scheduleLayout(); });
    }
    static get observedAttributes() { return ["src"]; }
    attributeChangedCallback(name, _old, value) { if (name === "src" && this._made && value) this.loadURL(value); }

    // Electron <webview> methods used by the UI
    getWebContentsId() { return this._tab; }
    loadURL(url) { this._url = url; post({ type: "tab:load", tab: this._tab, url }); return Promise.resolve(); }
    getURL() { return this._url; }
    getTitle() { return this._title; }
    canGoBack() { return this._canBack; }
    canGoForward() { return this._canFwd; }
    goBack() { post({ type: "tab:back", tab: this._tab }); }
    goForward() { post({ type: "tab:forward", tab: this._tab }); }
    reload() { post({ type: "tab:reload", tab: this._tab }); }
    reloadIgnoringCache() { post({ type: "tab:reload", tab: this._tab, hard: true }); }
    stop() { post({ type: "tab:stop", tab: this._tab }); }
    focus() { post({ type: "tab:focus", tab: this._tab }); }
    executeJavaScript(code) { return request({ type: "tab:exec", tab: this._tab, code: String(code) }); }
    getZoomFactor() { return this._zoom; }
    setZoomFactor(z) { this._zoom = z; post({ type: "tab:zoom", tab: this._tab, zoom: z }); }
    setAudioMuted(m) { post({ type: "tab:mute", tab: this._tab, muted: !!m }); }
    isCurrentlyAudible() { return this._audible; }
    print() { post({ type: "tab:print", tab: this._tab }); return Promise.resolve(); }
    findInPage(text, opts = {}) { post({ type: "tab:find", tab: this._tab, text: String(text), forward: opts.forward !== false }); return 1; }
    stopFindInPage() { post({ type: "tab:find", tab: this._tab, text: "" }); }
    openDevTools() { post({ type: "tab:devtools", tab: this._tab }); }
    closeDevTools() {}
    isDevToolsOpened() { return false; }
    send() {}
  }
  const createElement = Document.prototype.createElement;
  Document.prototype.createElement = function (tag, opts) {
    const el = createElement.call(this, tag, opts);
    if (String(tag).toLowerCase() === "webview") { Object.setPrototypeOf(el, StupidWebview.prototype); el._init(); }
    return el;
  };
  const isWebview = (n) => n instanceof StupidWebview;
  const each = (n, fn) => { if (n.nodeType !== 1) return; if (isWebview(n)) fn(n); n.querySelectorAll && n.querySelectorAll("webview").forEach((w) => isWebview(w) && fn(w)); };
  new MutationObserver((records) => {
    for (const r of records) {
      r.addedNodes.forEach((n) => each(n, (w) => w.isConnected && w.connectedCallback()));
      r.removedNodes.forEach((n) => each(n, (w) => w.disconnectedCallback()));
    }
  }).observe(document, { childList: true, subtree: true });

  // Keep every native tab exactly where its stand-in is, and tell the app which parts of the window
  // the UI covers (menus, popovers, Buddy…), so clicks there go to the UI and everywhere else on a
  // visible tab go to the page.
  const OVERLAYS = "#popover,#menu,#ctxMenu,#toast,#island:not(.gone),.buddy:not(.hidden),#cmdbar:not(.hidden),#findBar:not(.hidden),#hoverCard:not(.hidden),.ask-pill:not(.hidden),.bd-speech:not(.hidden),#suggest:not(.hidden),.hover-card";
  // Runs every frame only while something moves (animations, resizing, the UI changing); once nothing has
  // changed for a moment it stops, and changes to the page, animations or the window size start it again.
  let layoutQueued = false, last = "", still = 0, slowTimer = 0;
  function scheduleLayout() { still = 0; if (!layoutQueued) { layoutQueued = true; clearTimeout(slowTimer); requestAnimationFrame(() => layout(false)); } }
  function layout(fromTimer) {
    layoutQueued = false;
    const tabsOut = [];
    for (const [tab, el] of views) {
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      const spare = el.classList.contains("spare");
      const shown = el.isConnected && cs.display !== "none" && cs.visibility !== "hidden" && +cs.opacity > 0.01 && r.width > 0 && r.height > 0 && !spare;
      // The prepared new tab (spare) keeps its size and stays drawn, invisibly, so it appears instantly.
      tabsOut.push({ tab, x: r.left, y: r.top, w: r.width, h: r.height, shown, spare, opacity: Math.round(+cs.opacity * 100) / 100, radius: parseFloat(cs.borderTopLeftRadius) || 0 });
    }
    const covers = [];
    for (const el of document.querySelectorAll(OVERLAYS)) {
      if (el.classList.contains("hidden")) continue;
      const cs = getComputedStyle(el); if (cs.display === "none" || cs.visibility === "hidden") continue;
      const r = el.getBoundingClientRect(); if (r.width && r.height) covers.push({ x: r.left, y: r.top, w: r.width, h: r.height });
    }
    // Frame look for the native background: the same colours and tint the Electron CSS would paint.
    const b = document.body, root = getComputedStyle(document.documentElement), bs = b ? getComputedStyle(b) : root;
    const frame = b ? { bar: bs.getPropertyValue("--bar").trim(), bg: bs.getPropertyValue("--bg").trim(), accent: (document.documentElement.style.getPropertyValue("--accent") || root.getPropertyValue("--accent")).trim(),
      modern: b.classList.contains("look-modern"), tint: b.classList.contains("tint-none") ? "none" : b.classList.contains("tint-strong") ? "strong" : "soft" } : null;
    const msg = JSON.stringify({ tabsOut, covers, frame });
    if (msg !== last) { last = msg; still = 0; post({ type: "layout", tabs: tabsOut, covers, frame }); } else if (!fromTimer) still++;
    if (msg === last && fromTimer) { slowTimer = setTimeout(() => layout(true), 1000); return; }   // idle: one quiet check a second
    if (still < 20) { layoutQueued = true; requestAnimationFrame(() => layout(false)); }
    else slowTimer = setTimeout(() => layout(true), 1000);   // safety net for changes nothing announces
  }
  new MutationObserver(() => scheduleLayout()).observe(document, { subtree: true, childList: true, attributes: true, characterData: false });
  for (const ev of ["resize", "transitionrun", "transitionend", "animationstart", "animationend", "pointerdown", "pointerup", "wheel", "keydown"]) addEventListener(ev, scheduleLayout, { capture: true, passive: true });

  /* ---------------- messages from the Mac app ---------------- */
  window.__stupidHost = {
    reply(id, ok, value) { const p = pending.get(id); if (!p) return; pending.delete(id); ok ? p.resolve(value) : p.reject(new Error(value)); },
    emit(channel, args) { for (const fn of listeners.get(channel) || []) { try { fn(...args); } catch (e) { console.error(e); } } },
    // Events from a native tab, re-fired on its stand-in like Electron's webview events.
    tabEvent(tab, name, detail) {
      const el = views.get(tab); if (!el) return;
      if (detail) {
        if ("url" in detail && (name === "did-navigate" || name === "did-navigate-in-page")) el._url = detail.url;
        if ("title" in detail && name === "page-title-updated") el._title = detail.title;
        if ("canBack" in detail) { el._canBack = detail.canBack; el._canFwd = detail.canFwd; }
        if ("audible" in detail) el._audible = detail.audible;
        if ("zoom" in detail) el._zoom = detail.zoom;
      }
      if (name === "state") return;   // state-only update
      const ev = new Event(name);
      Object.assign(ev, detail || {});
      el.dispatchEvent(ev);
    },
  };
})();
