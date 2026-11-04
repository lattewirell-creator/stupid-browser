'use strict';
// On Google's sign-in pages only: the page sees Firefox, matching the user agent and headers main.js sends there
// (FIREFOX_UA). Google turns away browsers it takes for "embedded" Chromium ("This browser or app may not be secure"),
// and Chromium's own tells live in the page, not the network: navigator.userAgentData, window.chrome, the vendor.
// This runs in the page's own world before any of its scripts, so it sees a consistent Firefox from the start.
const { contextBridge } = require('electron');
if (location.protocol === 'https:' && /^accounts\.google\.(?:com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/i.test(location.hostname)) {
  try {
    contextBridge.executeInMainWorld({
      func: (platform) => {
        const nav = Navigator.prototype;
        const define = (name, value) => { try { Object.defineProperty(nav, name, { get: { [name]() { return value; } }[name], configurable: true, enumerable: true }); } catch {} };
        try { delete nav.userAgentData; } catch {}          // Firefox has no client hints in the page either
        try { delete window.chrome; } catch {}               // nor a window.chrome object
        if ('chrome' in window) try { window.chrome = undefined; } catch {}
        define('vendor', '');
        define('productSub', '20100101');
        define('oscpu', platform.startsWith('X11') ? 'Linux x86_64' : platform);
        define('buildID', '20181001000000');
        define('pdfViewerEnabled', true);
        if (platform.startsWith('X11')) define('platform', 'Linux x86_64');
      },
      args: [process.platform === 'darwin' ? 'Intel Mac OS X 10.15' : process.platform === 'win32' ? 'Windows NT 10.0; Win64; x64' : 'X11; Linux x86_64'],
    });
  } catch (e) { /* older Electron without executeInMainWorld: headers and user agent still say Firefox */ }
}
