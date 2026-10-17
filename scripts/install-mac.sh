#!/usr/bin/env bash
# Build the Mac app from the current code and install it to /Applications (replacing the old copy), then open it.
set -euo pipefail
cd "$(dirname "$0")/.."
ARCH=$( [ "$(uname -m)" = "arm64" ] && echo arm64 || echo x64 )
osascript -e 'tell application "The Stupid Browser" to quit' >/dev/null 2>&1 || true
sleep 2
rm -rf release
npx electron-builder --mac dir "--$ARCH" --publish never >/dev/null
SRC="release/mac-$ARCH/The Stupid Browser.app"; [ "$ARCH" = x64 ] && SRC="release/mac/The Stupid Browser.app"
rm -rf "/Applications/The Stupid Browser.app"
ditto "$SRC" "/Applications/The Stupid Browser.app"
xattr -dr com.apple.quarantine "/Applications/The Stupid Browser.app" 2>/dev/null || true
open "/Applications/The Stupid Browser.app"
echo "Installed to /Applications/The Stupid Browser.app"
