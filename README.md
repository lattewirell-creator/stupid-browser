# The Stupid Browser

A calm, warm-toned personal web browser for Mac, Windows, Linux and Android.
Tabs and tab groups, Stupid Search (its own calm results page), Buddy (a little AI helper), an AI sidebar (Claude first), an app sidebar, the Shield ad & tracker blocker,
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

## Linux
- Comes preinstalled as the default browser in [Stupid OS](https://github.com/lattewirell-creator/smartos), which keeps it updated.
- On Ubuntu, Debian and similar: download `StupidBrowser-<version>-linux-amd64.deb` from the [latest release](https://github.com/lattewirell-creator/stupid-browser/releases/latest) and run `sudo apt install ./StupidBrowser-<version>-linux-amd64.deb`.
- Build it: `npm run dist:linux` → `release/StupidBrowser-<version>-linux-amd64.deb`. Publishing a GitHub release builds and attaches it automatically (`.github/workflows/release-linux.yml`).
- Updates come through the system's package manager, not the browser's own updater.

## Android
- Download `StupidBrowser-<version>-android.apk` from the [latest release](https://github.com/lattewirell-creator/stupid-browser/releases/latest) on your phone and open it.
  Android asks once to allow installs from your browser or Files app: that's normal for apps outside Google Play.
- About 1.5 MB: tabs, the calm new-tab page, DuckDuckGo by default (7 engines), the Shield, downloads, find on page, share,
  full-screen video, dark mode, and it can be your default browser.
- Build it (needs JDK 17 and the Android SDK): `cd android && ./gradlew assembleRelease`.
  Release signing reads `android/keystore.properties` (not in git). Refresh the ad list with `node scripts/build-android-blocklist.js`.

## Stupid Search
`stupid://search/?q=…` is the browser's own search engine page: pick **Stupid Search** in Settings → Search engine and the
address bar lands there. The browser itself fetches DuckDuckGo's results (`src/search-main.js`), drops the ads, and adds a
Wikipedia card, a sum or unit conversion worked out on your computer (`src/pages/search-answers.js`), and the matching pages
from your bookmarks and history. Images, videos, news and maps open on DuckDuckGo, YouTube and OpenStreetMap; "Ask Buddy"
hands the question to `stupid://ask`. Nothing is sent anywhere but DuckDuckGo (and Wikipedia for the card), with no cookies.
On Mac and Android the page loads and says that web results aren't in that version yet (the core has no `search:web` handler), with a link to DuckDuckGo.
`npm run test:search` checks the parser and the answers without a network.

## Buddy Net
A separate, playful time-travelling browser lives in [`buddy-net/`](buddy-net/README.md): switch between the 90s, Internet Explorer, early Chrome, the experimental 2010s and the AI-filled 2020s.

## Releasing
`npm run release` (on a Mac) builds Windows and Mac and publishes a GitHub release that every installed copy updates from. See [RELEASING.md](RELEASING.md).
