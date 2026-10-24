// Buddy in 3D (buddy3d.js with three.js, ~700 kB) loads once the window's UI is up. As a <script type="module"> it
// held back the whole UI: the page isn't "ready" until every module has run. buddy.js mounts him on "buddy3d-ready".
'use strict';
addEventListener('DOMContentLoaded', () => {
  const go = () => import('./buddy3d.js').catch((e) => console.error('Buddy 3D failed to load:', e));
  if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 1200 }); else setTimeout(go, 300);
});
