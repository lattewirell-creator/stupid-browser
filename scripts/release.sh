#!/usr/bin/env bash
# Build the Windows installer (and, on a Mac, the macOS app) and publish a GitHub Release that both updaters pick up.
# Usage: bump "version" in package.json, commit, then: npm run release [-- "Release notes"]
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./package.json').version")
TAG="v$VERSION"
NOTES="${1:-The Stupid Browser $VERSION}"
REPO="lattewirell-creator/stupid-browser"

if gh release view "$TAG" -R "$REPO" >/dev/null 2>&1; then echo "Release $TAG already exists — bump the version first." >&2; exit 1; fi
if [ -n "$(git status --porcelain)" ]; then echo "Commit your changes first (git status is not clean)." >&2; exit 1; fi

rm -rf release
npm run dist:win
for f in release/StupidBrowser-Setup.exe release/StupidBrowser-Setup.exe.blockmap release/latest.yml; do
  [ -f "$f" ] || { echo "Missing $f" >&2; exit 1; }
done
grep -q "version: $VERSION" release/latest.yml || { echo "latest.yml version mismatch" >&2; exit 1; }
grep -q "url: StupidBrowser-Setup.exe" release/latest.yml || { echo "latest.yml file name mismatch" >&2; exit 1; }
FILES=(release/StupidBrowser-Setup.exe release/StupidBrowser-Setup.exe.blockmap release/latest.yml release/StupidBrowser-portable.exe)

# Android: built here when the signing key and SDK are available, otherwise the APK from the previous release
# comes along, so the download page keeps its Android link.
if [ -f android/keystore.properties ] && [ -d "$HOME/Library/Android/sdk" ]; then
  (cd android && JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17}" ./gradlew -q assembleRelease)
  cp android/app/build/outputs/apk/release/app-release.apk "release/StupidBrowser-$VERSION-android.apk"
else
  gh release download -R "$REPO" -p '*-android.apk' -D release 2>/dev/null || echo "No Android APK in the previous release." >&2
fi
for f in release/*-android.apk; do [ -f "$f" ] && FILES+=("$f"); done

# On a Mac, also build the macOS app: the native WebKit version (mac/), one universal app for Apple chip and
# Intel. The zips + latest-mac.yml are what installed Macs auto-update from; Electron installs (1.3.x) take the
# zip for their chip, which is the same app, so they move to the WebKit version (their data comes along).
if [ "$(uname)" = "Darwin" ]; then
  bash mac/build.sh
  # Signed outside the repo: iCloud-synced folders tag files with Finder info, which a strict signature check rejects.
  MACOUT="$HOME/Library/Caches/stupid-browser-release"; rm -rf "$MACOUT"; mkdir -p "$MACOUT"
  APP="$MACOUT/The Stupid Browser.app"
  ditto "mac/build/The Stupid Browser.app" "$APP"
  xattr -cr "$APP"; codesign --force --deep --sign - "$APP"
  codesign --verify --deep --strict "$APP" || { echo "The Mac app isn't properly signed" >&2; exit 1; }
  [ "$(/usr/bin/plutil -extract CFBundleShortVersionString raw -o - "$APP/Contents/Info.plist")" = "$VERSION" ] || { echo "Mac app version mismatch" >&2; exit 1; }
  ZIP="release/StupidBrowser-$VERSION-mac.zip"
  ditto -c -k --keepParent "$APP" "$ZIP"
  cp "$ZIP" "release/StupidBrowser-$VERSION-arm64.zip"; cp "$ZIP" "release/StupidBrowser-$VERSION-x64.zip"
  STAGE=$(mktemp -d); ditto "$APP" "$STAGE/The Stupid Browser.app"; ln -s /Applications "$STAGE/Applications"
  hdiutil create -volname "The Stupid Browser" -srcfolder "$STAGE" -ov -format UDZO "release/StupidBrowser-$VERSION-mac.dmg" >/dev/null
  MNT=$(mktemp -d); hdiutil attach -nobrowse -readonly -mountpoint "$MNT" "release/StupidBrowser-$VERSION-mac.dmg" >/dev/null
  codesign --verify --deep --strict "$MNT"/*.app || { hdiutil detach "$MNT" >/dev/null; echo "The app in the dmg isn't properly signed" >&2; exit 1; }
  hdiutil detach "$MNT" >/dev/null
  # latest-mac.yml in electron-builder's format (url + sha512 + size per file).
  VERSION="$VERSION" node -e '
    const fs = require("fs"), crypto = require("crypto"), v = process.env.VERSION;
    const names = ["mac.zip", "arm64.zip", "x64.zip", "mac.dmg"].map((s) => `StupidBrowser-${v}-${s}`);
    const info = names.map((n) => { const b = fs.readFileSync("release/" + n); return { n, sha: crypto.createHash("sha512").update(b).digest("base64"), size: b.length }; });
    const y = [`version: ${v}`, "files:", ...info.flatMap((f) => [`  - url: ${f.n}`, `    sha512: ${f.sha}`, `    size: ${f.size}`]),
      `path: ${info[0].n}`, `sha512: ${info[0].sha}`, `releaseDate: '"'"'${new Date().toISOString()}'"'"'`].join("\n") + "\n";
    fs.writeFileSync("release/latest-mac.yml", y);'
  FILES+=("release/StupidBrowser-$VERSION-mac.dmg" "release/StupidBrowser-$VERSION-mac.zip" "release/StupidBrowser-$VERSION-arm64.zip" "release/StupidBrowser-$VERSION-x64.zip" release/latest-mac.yml)
else
  echo "Not on a Mac: skipping the macOS build (Macs won't see this update)." >&2
fi

gh auth setup-git && git push origin HEAD
gh release create "$TAG" -R "$REPO" --target "$(git rev-parse HEAD)" --title "The Stupid Browser $VERSION" --notes "$NOTES" "${FILES[@]}"
echo "Published https://github.com/$REPO/releases/tag/$TAG"
