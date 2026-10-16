'use strict';
/* Shortcut labels. Markup is written Windows-style ("Ctrl+Shift+T"); on macOS they show as "⇧⌘T".
   Shared by the browser UI (index.html) and the stupid:// pages. */
(function () {
  const isMac = !!(window.stupid && window.stupid.platform === 'darwin');
  // Keys that differ on Mac (Chrome for Mac bindings), not just Ctrl -> Cmd.
  const MAC_COMBO = { 'Ctrl+H': 'Cmd+Y', 'Alt+Left': 'Cmd+[', 'Alt+Right': 'Cmd+]', 'Alt+Home': 'Cmd+Shift+H' };
  const MOD = { Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Cmd: '⌘' };
  const KEY = { Delete: '⌫', Left: '←', Right: '→', Home: '↖' };
  const RE = /\b(?:Ctrl|Alt)\+(?:Shift\+)?(?:Delete|Home|Left|Right|[A-Z0-9,])(?![A-Za-z])/g;
  function mac(combo) {
    combo = MAC_COMBO[combo] || combo.replace(/^Ctrl\+/, 'Cmd+');
    const parts = combo.split('+'); const key = parts.pop();
    return ['Ctrl', 'Alt', 'Shift', 'Cmd'].filter((m) => parts.includes(m)).map((m) => MOD[m]).join('') + (KEY[key] || key);
  }
  const keyLabel = (s) => (isMac && s ? String(s).replace(RE, mac) : s);
  function localizeKeys(root) {
    if (!isMac || !root) return;
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) if (RE.test(n.nodeValue)) { RE.lastIndex = 0; n.nodeValue = keyLabel(n.nodeValue); }
    for (const e of root.querySelectorAll('[title]')) e.title = keyLabel(e.title);
  }
  window.keyLabel = keyLabel;
  window.localizeKeys = localizeKeys;
  if (isMac) document.documentElement.classList.add('mac');
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => localizeKeys(document.body));
  else localizeKeys(document.body);
})();
