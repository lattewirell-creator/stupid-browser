/* The Stupid Browser for Android: phone touches for the desktop UI (src/), loaded after mac/js/host-shell.js.
 *  - Hold the + (new tab) button: a private window. A tap is a plain new tab, like on a computer.
 *  - Hold a link or image in a page: the desktop version's page menu (src/main.js pageContextMenu).
 *  - Menus the core asks for (bookmark folders) as the UI's own menus.
 *  - Android's back gesture: closes what's open, then goes back in the tab. */
(() => {
  "use strict";
  const post = (m) => window.webkit.messageHandlers.host.postMessage(m);
  const emit = (ch, ...args) => window.__stupidHost && __stupidHost.emit(ch, args);
  const call = (ch, ...args) => window.stupid.invoke(ch, ...args);
  const g = (name) => (typeof window[name] === "function" ? window[name] : () => {});   // renderer.js functions (the page's CSP allows no eval)

  /* ---------------- hold + for a private window ---------------- */
  let holdTimer = 0, held = false;
  document.addEventListener("pointerdown", (e) => {
    const b = e.target.closest && e.target.closest("#newTabBtn");
    if (!b) return;
    held = false;
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => { held = true; post({ type: "android:haptic" }); call("win:new", { incognito: true }); }, 450);
  }, true);
  for (const ev of ["pointerup", "pointercancel", "pointerleave"]) document.addEventListener(ev, () => clearTimeout(holdTimer), true);
  document.addEventListener("click", (e) => { if (held && e.target.closest && e.target.closest("#newTabBtn")) { held = false; e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  document.addEventListener("contextmenu", (e) => { if (e.target.closest && e.target.closest("#newTabBtn")) e.preventDefault(); }, true);

  /* ---------------- how tall the bars are (they slide away while you scroll down a page) ---------------- */
  let lastBars = -1;
  const bars = () => {
    const tb = document.getElementById("toolbar");
    const vis = tb && getComputedStyle(tb).display !== "none" && !document.body.classList.contains("compact");
    const h = vis ? Math.round(tb.getBoundingClientRect().bottom) : 0;
    if (h !== lastBars) { lastBars = h; post({ type: "android:bars", h }); document.documentElement.style.setProperty("--android-below-bars", (h ? h - 4 : 104) + "px"); }
  };
  document.addEventListener("DOMContentLoaded", () => {
    const ro = new ResizeObserver(bars);
    ["titlebar", "toolbar"].forEach((id) => { const e = document.getElementById(id); if (e) ro.observe(e); });
    new MutationObserver(bars).observe(document.body, { attributes: true, attributeFilter: ["class"] });
    bars();
  });

  /* ---------------- the tab you're on stays in view in the tab strip ---------------- */
  let lastActive = null;
  const reveal = () => {
    const a = document.querySelector("#tabs .tab.active");
    if (!a || a === lastActive) return;
    lastActive = a;
    const show = () => a.isConnected && a.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
    requestAnimationFrame(show);
    setTimeout(show, 360);   // again once a new tab has finished growing into the strip
  };
  document.addEventListener("DOMContentLoaded", () => {
    const strip = document.getElementById("tabs");
    if (strip) new MutationObserver(reveal).observe(strip, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
  });

  /* ---------------- menus ---------------- */
  const show = (items, x, y) => g("showMenu")("ctxMenu", items, x, y);
  // Long-press in a page: info from the app (what was under the finger), x/y in UI coordinates.
  window.__androidPageMenu = (info, x, y) => {
    const open = (url, where) => emit("open-url", { url, where });
    const copy = (text) => call("clipboard:write", text);
    const save = (url) => post({ type: "android:save", url, tab: info.tab });
    const items = [];
    const sep = () => { if (items.length && items[items.length - 1] !== "-") items.push("-"); };
    const { link = "", src = "", media = "none" } = info;
    const sel = String(info.selection || "").trim();
    if (/^(https?|stupid):/.test(link)) {
      items.push({ label: "Open link in new tab", fn: () => open(link, "background") });
      items.push({ label: "Open link in private window", fn: () => call("win:new", { incognito: true, url: link }) });
      items.push({ label: "Download link", fn: () => save(link) });
      items.push({ label: "Copy link address", fn: () => copy(link) });
      sep();
    }
    if (media === "image" && src) {
      items.push({ label: "Open image in new tab", fn: () => open(src, "background") });
      items.push({ label: "Download image", fn: () => save(src) });
      items.push({ label: "Copy image address", fn: () => copy(src) });
      sep();
    }
    if ((media === "video" || media === "audio") && src && !src.startsWith("blob:")) {
      items.push({ label: `Download ${media}`, fn: () => save(src) });
      items.push({ label: `Copy ${media} address`, fn: () => copy(src) });
      sep();
    }
    if (sel) {
      const short = sel.length > 28 ? sel.slice(0, 28) + "…" : sel;
      const engine = info.engineName || "the web";
      items.push({ label: "Copy", fn: () => copy(sel) });
      items.push({ label: `Search ${engine} for “${short}”`, fn: () => open((info.searchUrl || "https://duckduckgo.com/?q=%s").replace("%s", encodeURIComponent(sel)), "foreground") });
      items.push({ label: "Ask AI about this", fn: () => { copy(sel); emit("shortcut", "open-ai"); } });
      sep();
    }
    if (items[items.length - 1] === "-") items.pop();
    if (items.length) show(items, x, y);
  };
  // Menus described by the core: [{ label, enabled?, submenu?, emit?: [channel, …args] }]
  window.__androidPopup = (list, x, y) => {
    const build = (l) => l.map((d) => d.submenu ? { label: d.label + "  ›", fn: () => setTimeout(() => show(build(d.submenu), x, y), 0) }
      : d.emit ? { label: d.label, disabled: d.enabled === false, fn: () => emit(...d.emit) } : { label: d.label, disabled: true, fn: () => {} });
    show(build(list), x, y);
  };

  /* ---------------- "Ask Buddy" next to selected text: always fully on screen ---------------- */
  addEventListener("load", () => {
    const orig = window.onPageSelection;
    if (typeof orig !== "function") return;
    window.onPageSelection = (tab, s) => {
      orig(tab, s);
      const p = document.querySelector(".ask-pill");
      if (!p || p.classList.contains("hidden") || !p.offsetParent) return;
      const max = p.offsetParent.clientWidth - p.offsetWidth - 8;
      if ((parseFloat(p.style.left) || 0) > max) p.style.left = Math.max(8, max) + "px";
    };
  });

  /* ---------------- back gesture ---------------- */
  const open = (sel) => { const e = document.querySelector(sel); return e && !e.classList.contains("hidden") && getComputedStyle(e).display !== "none" ? e : null; };
  window.__androidBack = () => {
    if (open("#menu") || open("#ctxMenu")) { g("hideMenus")(); return "ui"; }
    if (open("#popover")) { g("hidePop")(true); return "ui"; }
    if (open("#suggest")) { g("closeSuggest")(); document.activeElement && document.activeElement.blur(); return "ui"; }
    if (open("#cmdbar")) { g("closeCmd")(); return "ui"; }
    if (open("#findBar")) { const c = document.getElementById("findClose"); c && c.click(); return "ui"; }
    if (open("#aiPanel")) { g("closeAI")(); return "ui"; }
    if (open("#appPanel")) { const c = document.getElementById("appClose"); c && c.click(); return "ui"; }
    if (document.activeElement && document.activeElement.id === "address") { document.activeElement.blur(); return "ui"; }
    return "";   // the app goes back in the visible tab
  };
})();
