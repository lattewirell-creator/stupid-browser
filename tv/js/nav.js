'use strict';
/* Remote-control navigation: the arrow keys move focus to the nearest [data-nav] element in that direction.
   Inside a dialog (#sheet) only the dialog's own elements count. */
var Nav = (function () {
  function scope() {
    var sheet = document.getElementById('sheet');
    return sheet.classList.contains('hidden') ? document.getElementById('stage') : sheet;
  }
  function items() {
    var list = scope().querySelectorAll('[data-nav]');
    var out = [];
    for (var i = 0; i < list.length; i++) if (list[i].offsetParent !== null && !list[i].disabled) out.push(list[i]);
    return out;
  }
  function center(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

  // Left/right stays on the same row. Up/down goes to the nearest row in that direction and lands on the
  // element closest to the same spot on screen (so "down" from the third tile lands under it).
  function pick(from, dir) {
    var a = from.getBoundingClientRect(), ca = center(a), cands = items(), found = [], minGap = Infinity, i;
    for (i = 0; i < cands.length; i++) {
      var el = cands[i]; if (el === from) continue;
      var b = el.getBoundingClientRect(), cb = center(b), gap, cross;
      if (dir === 'left' || dir === 'right') {
        if (dir === 'left' ? b.right > a.left + 4 : b.left < a.right - 4) continue;
        if (b.bottom <= a.top || b.top >= a.bottom) continue;   // not on this row
        gap = dir === 'left' ? a.left - b.right : b.left - a.right; cross = Math.abs(cb.y - ca.y);
      } else {
        if (dir === 'up' ? b.bottom > a.top + 4 : b.top < a.bottom - 4) continue;
        gap = dir === 'up' ? a.top - b.bottom : b.top - a.bottom; cross = Math.abs(cb.x - ca.x);
      }
      gap = Math.max(0, gap);
      found.push({ el: el, gap: gap, cross: cross });
      if (gap < minGap) minGap = gap;
    }
    var best = null;
    for (i = 0; i < found.length; i++) {
      var f = found[i];
      if (f.gap > minGap + 40) continue;   // only the nearest row (or the next tile)
      if (!best || f.cross + f.gap < best.cross + best.gap) best = f;
    }
    return best && best.el;
  }
  function focus(el) {
    if (!el) return false;
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
    var row = el.closest ? el.closest('.strip') : null;
    if (row) keepVisible(row, el);
    return true;
  }
  // Rows scroll sideways so the focused tile (and a peek of the next one) stays on screen.
  function keepVisible(row, el) {
    var pad = 80, left = el.offsetLeft - pad, right = el.offsetLeft + el.offsetWidth + pad;
    var target = row.scrollLeft;
    if (left < row.scrollLeft) target = left;
    else if (right > row.scrollLeft + row.clientWidth) target = right - row.clientWidth;
    row.scrollLeft = Math.max(0, target);
  }
  function move(dir) {
    var cur = document.activeElement;
    var list = items();
    if (!cur || list.indexOf(cur) < 0) return focus(list[0]);
    return focus(pick(cur, dir));
  }
  return { move: move, focus: focus, items: items };
})();
