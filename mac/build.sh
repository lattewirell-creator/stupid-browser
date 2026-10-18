#!/usr/bin/env bash
# Build "The Stupid Browser" for Mac (WebKit) into mac/build/The Stupid Browser.app.
# The UI is the Electron app's src/ folder, copied in unchanged; core-gen.js is regenerated from it.
set -euo pipefail
cd "$(dirname "$0")"
APP="build/The Stupid Browser.app"
VERSION=$(node -p "require('../package.json').version")
python3 tools/gen-core.py >/dev/null
# Ad blocker rules (WebKit content blocker), built from EasyList + EasyPrivacy when missing.
[ -f adblock/rules.json ] || node ../scripts/build-mac-blocklist.js
rm -rf "$APP" && mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/app/mac"
# One app for Apple chip and Intel Macs.
for ARCH in arm64 x86_64; do
  swiftc -O -target $ARCH-apple-macos13.0 Sources/*.swift -o "build/StupidBrowser-$ARCH" -framework Cocoa -framework WebKit -framework UniformTypeIdentifiers -lsqlite3
done
lipo -create build/StupidBrowser-arm64 build/StupidBrowser-x86_64 -output "$APP/Contents/MacOS/StupidBrowser" && rm build/StupidBrowser-arm64 build/StupidBrowser-x86_64
rsync -a --delete --exclude '*.map' ../src/ "$APP/Contents/Resources/app/src/"
rsync -a js core adblock "$APP/Contents/Resources/app/mac/"
cp ../build/icon.icns "$APP/Contents/Resources/AppIcon.icns"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>The Stupid Browser</string>
  <key>CFBundleDisplayName</key><string>The Stupid Browser</string>
  <key>CFBundleIdentifier</key><string>com.emil.stupidbrowser.webkit</string>
  <key>CFBundleExecutable</key><string>StupidBrowser</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${VERSION}</string>
  <key>CFBundleVersion</key><string>${VERSION}</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSCameraUsageDescription</key><string>Websites you allow can use your camera.</string>
  <key>NSMicrophoneUsageDescription</key><string>Websites you allow can use your microphone.</string>
  <key>NSLocationUsageDescription</key><string>Websites you allow can see your location.</string>
  <key>CFBundleURLTypes</key><array><dict><key>CFBundleURLName</key><string>Web site URL</string><key>CFBundleURLSchemes</key><array><string>http</string><string>https</string></array></dict></array>
</dict></plist>
PLIST
codesign --force -s - "$APP" >/dev/null 2>&1 || true
echo "built $APP"
