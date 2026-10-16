#!/usr/bin/env bash
# Build the Windows installer and publish it as a GitHub Release that electron-updater picks up.
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

git push origin HEAD
gh release create "$TAG" -R "$REPO" --target "$(git rev-parse HEAD)" --title "The Stupid Browser $VERSION" --notes "$NOTES" \
  release/StupidBrowser-Setup.exe release/StupidBrowser-Setup.exe.blockmap release/latest.yml release/StupidBrowser-portable.exe
echo "Published https://github.com/$REPO/releases/tag/$TAG"
