# The Stupid Browser

A calm, warm-toned personal web browser for Windows and macOS, built with Electron.
Tabs and tab groups, an AI sidebar (Claude first), an Opera-style app sidebar, ad & tracker blocker,
history, downloads, bookmarks, passwords, private windows and auto-updates.

- Run from source: `npm install && npm start`
- Build Windows installer: `npm run dist:win`
- Build macOS app (on a Mac): `npm run dist:mac` → `release/StupidBrowser-<version>-arm64.dmg` and `-x64.dmg`
- Ship an update: see [RELEASING.md](RELEASING.md)

## macOS notes
- Shortcuts follow Chrome for Mac (⌘T, ⌘W, ⌘Y history, ⌘[ / ⌘] back/forward, ⌥⌘I dev tools …), and there's a normal menu bar.
- The build isn't signed with an Apple Developer ID, so the first launch is blocked by Gatekeeper.
  Right-click the app → **Open**, or run `xattr -dr com.apple.quarantine "/Applications/The Stupid Browser.app"`.
- Automatic updates are Windows-only for now (macOS updates need a signed app). Install a newer .dmg to update.
