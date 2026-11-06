'use strict';
// The private new tab: just says where you are. The address bar is the search box (as on the normal new tab).
if (/Mac/.test(navigator.platform)) { const h = document.getElementById('hint'); if (h) h.textContent = h.textContent.replace('Ctrl+Shift+N', '⌘⇧N'); }
// Nothing moves while the tab isn't on screen (a hidden tab, or the window's ready-made spare new tab).
const still = () => document.documentElement.classList.toggle('paused', document.visibilityState !== 'visible');
document.addEventListener('visibilitychange', still); still();
