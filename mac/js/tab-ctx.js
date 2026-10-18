/* The Stupid Browser for Mac: runs in every frame of a tab (isolated world). When the page's context menu
 * is about to open, tells the app what was right-clicked, so it can show the Electron version's menu. */
(() => {
  "use strict";
  document.addEventListener("contextmenu", (e) => {
    const t = e.target && e.target.nodeType === 1 ? e.target : e.target && e.target.parentElement;
    if (!t) return;
    const a = t.closest("a[href]");
    const media = t.closest("img, video, audio");
    const tag = media ? media.tagName.toLowerCase() : "";
    const edit = !!t.closest("input, textarea, [contenteditable=''], [contenteditable='true']");
    const sel = String(getSelection() || "").trim();
    try {
      window.webkit.messageHandlers.tab.postMessage({ type: "ctx", link: a ? a.href : "", src: media ? (media.currentSrc || media.src || "") : "",
        media: tag === "img" ? "image" : tag || "none", editable: edit, selection: sel.slice(0, 2000), top: window.top === window });
    } catch {}
  }, true);
})();
