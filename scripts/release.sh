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

# On a Mac, also build the macOS app. The zips + latest-mac.yml are what installed Macs auto-update from.
if [ "$(uname)" = "Darwin" ]; then
  # Built outside the repo: iCloud-synced folders (like Desktop) tag files with Finder info, which a strict
  # signature check (and so Gatekeeper) rejects inside the dmg. scripts/adhoc-sign.js signs the app.
  MACOUT="$HOME/Library/Caches/stupid-browser-release"; rm -rf "$MACOUT"
  npx electron-builder --mac dmg zip --arm64 --x64 --publish never -c.directories.output="$MACOUT"
  cp "$MACOUT"/StupidBrowser-"$VERSION"-*.dmg "$MACOUT"/StupidBrowser-"$VERSION"-*.zip "$MACOUT"/latest-mac.yml release/
  for a in arm64 x64; do
    MNT=$(mktemp -d); hdiutil attach -nobrowse -readonly -mountpoint "$MNT" "release/StupidBrowser-$VERSION-$a.dmg" >/dev/null
    codesign --verify --deep --strict "$MNT"/*.app || { hdiutil detach "$MNT" >/dev/null; echo "The $a app in the dmg isn't properly signed" >&2; exit 1; }
    hdiutil detach "$MNT" >/dev/null
  done
  for a in arm64 x64; do
    for f in "release/StupidBrowser-$VERSION-$a.dmg" "release/StupidBrowser-$VERSION-$a.zip"; do [ -f "$f" ] || { echo "Missing $f" >&2; exit 1; }; done
    grep -q "url: StupidBrowser-$VERSION-$a.zip" release/latest-mac.yml || { echo "latest-mac.yml is missing the $a zip" >&2; exit 1; }
    FILES+=("release/StupidBrowser-$VERSION-$a.dmg" "release/StupidBrowser-$VERSION-$a.zip")
  done
  FILES+=(release/latest-mac.yml)
else
  echo "Not on a Mac: skipping the macOS build (Macs won't see this update)." >&2
fi

gh auth setup-git && git push origin HEAD
gh release create "$TAG" -R "$REPO" --target "$(git rev-parse HEAD)" --title "The Stupid Browser $VERSION" --notes "$NOTES" "${FILES[@]}"
echo "Published https://github.com/$REPO/releases/tag/$TAG"
