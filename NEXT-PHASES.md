# The Stupid Browser — status

## v0.2.0 (shipped 2026-10-16)
Architecture: `src/main.js` (windows, sessions, IPC with per-channel caller checks), `src/store.js` (JSON in userData),
`src/preload.js` (browser UI bridge), `src/internal-preload.js` (stupid:// pages only, protocol-gated),
`src/page-preload.js` (password save/fill in web pages, origin-checked in main), `src/renderer.js` (UI, vanilla JS),
`src/pages/*` (stupid://newtab, settings, history, downloads, bookmarks, source).

Built:
- Tabs: X on every tab, middle-click close, close others / to the right, reopen closed (Ctrl+Shift+T), drag reorder,
  mute + speaker indicator, hover card, pinned icon tabs, Chrome-style tab groups (named/colored chips, collapse/expand,
  ungroup, close group, drag into group, saved across restarts), split view (Ctrl+Shift+S).
- Opera-style left sidebar: Claude, WhatsApp, Discord, Instagram, Spotify, YouTube Music, Twitch; add/remove/reorder;
  persistent session `persist:stupid-apps` (Claude uses `persist:stupid-ai`, shared with the AI sidebar).
- Settings (stupid://settings, Ctrl+,): appearance, startup, search engine, privacy (clear data w/ ranges, Shield, DNT,
  per-site permissions), passwords, downloads, AI sidebar, sidebar apps, default browser, about.
- History (Ctrl+H), downloads manager (Ctrl+J), bookmarks manager with folders (Ctrl+Shift+O), find (Ctrl+F),
  zoom (Ctrl +/-/0), print (Ctrl+P), view source (Ctrl+U), dev tools (F12), full screen (F11), session restore,
  page context menu, padlock/site info, permission prompts, address-bar autocomplete, private windows (Ctrl+Shift+N),
  multiple windows (Ctrl+N), password save/fill (safeStorage/DPAPI), Windows default-browser registration (build/installer.nsh).

Known limits:
- Clearing cookies/cache ignores the time range (Electron can only clear these all-time).
- Spotify playback needs Widevine DRM, which stock Electron lacks (browsing works, songs may not play).
- Updates: placeholder only.
- Password fill picks the first saved login for the site (no account picker yet).

## Next: Phase 3 "Stupid Workspace" (only the most important first)
Stupid Account (profile avatar top-right, local profiles), 9-dot launcher + new-tab tiles, per-account data in userData.
Apps in this order: **Stupid Mail** (imapflow + nodemailer + mailparser + sanitize-html already installed; safeStorage
credentials; Gmail/iCloud/Outlook presets), **Stupid Drive**, **Stupid Docs**, **Stupid Calendar**. Add them to the
sidebar defaults and an "Ask Claude" button in each.

Later: Stupid Sheets, Slides, Keep, Tasks, Forms; Spaces; GX Control (RAM/CPU/network limiters, Hot Tabs Killer, panic
button). Not planned (need servers): Meet, Chat, Sites, Vids, AppSheet, Notebook.

## Build & test
npm run dist:win     -> release/StupidBrowser-Setup.exe (NSIS, per-user) + release/StupidBrowser-portable.exe
npm run build:adblock (refresh Ghostery lists)
Self-test: STUPID_SELFTEST=/tmp/s.png STUPID_SELFTEST_STEPS="quit@170000" STUPID_SELFTEST_SCRIPT=test/selftest.js \
  xvfb-run -a electron --no-sandbox --user-data-dir=/tmp/x .     (also test/restore.js, test/extra.js)

## Shipped in 1.1.0
- Auto-updates via GitHub Releases (electron-updater): checks on startup + every 4 h, background download, "Restart to update" banner, Settings → About status/check button, installs on quit. Portable exe shows a note instead. See RELEASING.md.

## Unreleased (macos-support branch)
- macOS support: Mac title bar + menu bar, Chrome-for-Mac shortcuts (⌘ labels), dmg/zip builds (`npm run dist:mac`).
- Music island (src/island.js + src/media-preload.js): floating "now playing" pill when music plays in a tab/sidebar app
  you're not looking at. Hover for controls, click to jump there, drag to move (double-click resets position),
  playlist panel for YouTube playlists, YouTube Music queue and Spotify track lists. Toggle in Settings → Appearance.
- Profile button + app grid (src/workspace.js), top-right like Chrome: name/email/color, pick any webmail
  (Gmail, Proton, Outlook, iCloud, Yahoo, Tuta, custom); customizable 9-dot app grid (add, rename, remove, drag to reorder).
  Profiles are a card only for now: not separate data per profile yet.
- DuckDuckGo is the default search engine for new installs.
