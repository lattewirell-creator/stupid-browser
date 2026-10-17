# The Stupid Browser

A calm, warm-toned personal web browser for Windows, macOS and Android. The desktop app is built with Electron.
Tabs and tab groups, an AI sidebar (Claude first), an Opera-style app sidebar, ad & tracker blocker,
history, downloads, bookmarks, passwords, private windows and auto-updates.

- Run from source: `npm install && npm start`
- Build Windows installer: `npm run dist:win`
- Build macOS app (on a Mac): `npm run dist:mac` → `release/StupidBrowser-<version>-arm64.dmg` and `-x64.dmg`
- Ship an update: see [RELEASING.md](RELEASING.md)

## Android
- Download `StupidBrowser-<version>-android.apk` from the [latest release](https://github.com/lattewirell-creator/stupid-browser/releases/latest) on your phone and open it.
  Android asks once to allow installs from your browser or Files app: that's normal for apps outside Google Play.
- A small native app (about 1.5 MB) on Android's WebView: tabs, the calm new-tab page, DuckDuckGo by default (7 engines),
  ad & tracker blocker, downloads, find on page, share, full-screen video, dark mode, and it can be your default browser.
- Build it (needs JDK 17 and the Android SDK): `cd android && ./gradlew assembleRelease`.
  Release signing reads `android/keystore.properties` (not in git). Refresh the ad list with `node scripts/build-android-blocklist.js`.

## macOS notes
- Shortcuts follow Chrome for Mac (⌘T, ⌘W, ⌘Y history, ⌘[ / ⌘] back/forward, ⌥⌘I dev tools …), and there's a normal menu bar.
- The build isn't signed with an Apple Developer ID, so the first launch is blocked by Gatekeeper.
  Right-click the app → **Open**, or run `xattr -dr com.apple.quarantine "/Applications/The Stupid Browser.app"`.
- Automatic updates work on Mac too, once the app is in your Applications folder (drag it there from the .dmg).
