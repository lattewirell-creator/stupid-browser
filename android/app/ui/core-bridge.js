/* The Stupid Browser for Android: the core's messages to the app (mac/core/core-shims.js posts here). */
window.webkit = { messageHandlers: { core: { postMessage: (m) => StupidCoreNative.post(JSON.stringify(m)) } } };
