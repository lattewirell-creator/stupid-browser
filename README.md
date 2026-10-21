# The Stupid Browser

A calm, warm-toned personal web browser for Mac, Windows and Android.
Tabs and tab groups, Buddy (a little AI helper), an AI sidebar (Claude first), an app sidebar, the Shield ad & tracker blocker,
Rewind, the music island, history, downloads, bookmarks, passwords, profiles, private windows and automatic updates.

- **Mac:** a native app on Apple's WebKit (Safari's engine). One download for Apple chip and Intel Macs, about 7 MB.
- **Windows:** runs on Chromium, the engine behind Chrome and Edge.
- **Android:** a small native app on Android's built-in WebView.

All three share the same look and features. The interface lives in `src/` and runs unchanged on every platform.

## Mac
- Build: `bash mac/build.sh` → `mac/build.noindex/The Stupid Browser.app` (needs the Xcode command line tools).
- The app is a Swift shell (`mac/Sources`) that shows the interface from `src/` in WebKit, with each tab as its own WebKit view.
  The browser logic in `mac/core` is shared with the other versions; `mac/tools/gen-core.py` copies it over at build time.
- Shortcuts follow Chrome for Mac (⌘T, ⌘W, ⌘Y history, ⌘[ / ⌘] back/forward, ⌥⌘I developer tools …), and there's a normal menu bar.
- It isn't signed with a paid Apple Developer ID, so macOS asks once on first launch: right-click the app → **Open**
  (or **System Settings → Privacy & Security → Open Anyway**). Updates install themselves once the app is in Applications.

## Windows
- Run from source: `npm install && npm start`. Build the installer: `npm run dist:win`.

## Android
- Download `StupidBrowser-<version>-android.apk` from the [latest release](https://github.com/lattewirell-creator/stupid-browser/releases/latest) on your phone and open it.
  Android asks once to allow installs from your browser or Files app: that's normal for apps outside Google Play.
- About 1.5 MB: tabs, the calm new-tab page, DuckDuckGo by default (7 engines), the Shield, downloads, find on page, share,
  full-screen video, dark mode, and it can be your default browser.
- Build it (needs JDK 17 and the Android SDK): `cd android && ./gradlew assembleRelease`.
  Release signing reads `android/keystore.properties` (not in git). Refresh the ad list with `node scripts/build-android-blocklist.js`.

## Releasing
`npm run release` (on a Mac) builds Windows and Mac and publishes a GitHub release that every installed copy updates from. See [RELEASING.md](RELEASING.md).
