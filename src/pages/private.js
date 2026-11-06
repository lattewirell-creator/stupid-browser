'use strict';
// The private new tab: just says where you are. The address bar is the search box (as on the normal new tab).
if (/Mac/.test(navigator.platform)) { const h = document.getElementById('hint'); if (h) h.textContent = h.textContent.replace('Ctrl+Shift+N', '⌘⇧N'); }
