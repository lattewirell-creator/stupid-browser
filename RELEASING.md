# Releasing an update

Installed copies (StupidBrowser-Setup.exe) check GitHub Releases on startup and every 4 hours,
download new versions in the background, and show “Restart to update” (or install on quit).
The portable exe can't update itself.

## One command
1. Bump `"version"` in `package.json` (must be higher than the last release, e.g. 1.1.0 → 1.2.0).
2. Commit: `git commit -am "v1.2.0"`
3. Ship: `npm run release -- "What's new in this version"`

`npm run release` (scripts/release.sh) builds with `npm run dist:win`, checks that `latest.yml` matches the
version and file name, pushes the commit, and creates GitHub Release `v<version>` with:
`StupidBrowser-Setup.exe`, `StupidBrowser-Setup.exe.blockmap`, `latest.yml` (+ the portable exe).

## By hand
```
npm run dist:win
gh release create v1.2.0 -R lattewirell-creator/stupid-browser --title "The Stupid Browser 1.2.0" --notes "…" \
  release/StupidBrowser-Setup.exe release/StupidBrowser-Setup.exe.blockmap release/latest.yml
```
Don't rename the files: the Windows updater downloads exactly the names listed in `latest.yml`.
Don't change `appId` in package.json, or Windows treats it as a different app.

## Before releasing
- `npm test` (headless self-tests, needs xvfb on Linux)
- Building on Linux needs wine for the Windows exe resources (`apt install wine wine64`).

## Mac builds and updates
Run `npm run release` **on a Mac** and it also builds the Mac app (`bash mac/build.sh`: one universal app for Apple chip
and Intel) and uploads `StupidBrowser-<version>-mac.dmg` (for new installs and the website), `StupidBrowser-<version>-mac.zip`,
the same zip as `-arm64.zip` / `-x64.zip` (what Macs on 1.3.x update from) and `latest-mac.yml`.
Releasing from Windows/Linux skips the Mac build, so Macs won't see that version.

Installed Macs check GitHub Releases on startup and every 4 hours (mac/Sources/Updater.swift), download the zip,
verify its SHA-512 against `latest-mac.yml`, and swap the app on restart or quit. This works without an Apple Developer ID,
but the app must live somewhere writable (e.g. /Applications), not run from the disk image.
Don't change the Mac app's bundle id (com.emil.stupidbrowser), or installed Macs won't accept the update.
