# Buddy Net

A time-travelling web browser. Pick an era in the **Time Machine** bar at the bottom and the whole browser changes with it:
the window, the toolbar, the sounds and the web itself.

| Era | Browser | What it's like |
|---|---|---|
| **90s** (1996–1999) | Buddy Net Navigator | Grey bevelled Windows 95 chrome, big labelled buttons, a "Location:" field, the shooting-star throbber, an Images on/off button, and a dial-up modem handshake when you connect. |
| **2000s** (2000–2005) | Buddy Net Explorer | Windows XP blue title bar, round green Back/Forward buttons, an "Address" bar with Go, a Links bar, a junk BuddyBar™ toolbar, the yellow pop-up blocker bar, and an XP-style taskbar. |
| **Late 2000s** (2006–2009) | Buddy Net Chrome | Blue frame with slanted tabs on top, one omnibox, a wrench menu and a "Most visited" thumbnail new tab page. |
| **2010s Labs** (2010–2016) | Buddy Net Labs | A Windows 8-style start screen with app logos and live tiles that flip to show news, a 2012-style share bar with counters (Like, Tweet, +1, Pin it) and a Labs panel full of experiments: Instafilter, 3D Web, Night Mode and leather-and-stitches skeuomorphism. |
| **AI 2020s** (today) | Buddy Net AI | Dark and rounded, "Ask Buddy or type a URL", AI insight pills and the Buddy AI sidebar that summarizes, explains or answers questions about the page you're on. |

## Time travel
In the four older eras every page loads from the [Wayback Machine](https://web.archive.org) as it looked in the year shown
in the Time Machine (use ◀ ▶ to pick another year in that era). Links you click, and results from searches, stay in that year.
Turn it off under ⚙ ("Time-travel pages") to browse today's web in an old browser. The 2020s always show the live web.

## Buddy AI
Works out of the box with an offline summarizer that reads the page. For real answers, paste an Anthropic API key under ⚙
(it's stored only on your computer) or start the app with `ANTHROPIC_API_KEY` set, and Buddy answers with Claude.

## Updates
Installed copies check for a new version on startup and every 4 hours. Each era announces it its own way:
a Windows 95 download dialog with flying paper (90s), an XP taskbar balloon and Windows Update (2000s), a green arrow
on the wrench with a relaunch bubble (late 2000s), a Windows 8 toast (2010s), or Buddy asking to update itself (2020s).
Nothing downloads until you say yes, and the version and a "Check for updates" button are under ⚙.

- **Windows:** the installer (`BuddyNet-Setup.exe`) updates itself. A copy run from a zip can't, and points to the download page.
- **Mac:** downloads the zip for your chip, checks its SHA-512 and swaps the app on restart. The app has to be in a
  writable folder such as Applications, not running from Downloads' quarantine copy.
- **Linux:** the `.deb` updates through the system's package installer (it asks for your password).

### Releasing a new version
1. Bump `"version"` in `buddy-net/package.json` on main.
2. On GitHub: **Actions → Release Buddy Net → Run workflow**, and write what's new.

The workflow builds all three platforms and uploads them to the release tagged **`buddy-net`**, which every installed
copy updates from. That release is a pre-release on purpose, and its files are named `buddynet*.yml` / `BuddyNet-*`,
so The Stupid Browser's own updater never picks it up. Don't rename the files or change `appId` (`com.emil.buddynet`).

Try the update prompts without a release: `BUDDYNET_FAKE_UPDATE=1 npm start` pretends version 9.9.9 is out.

## Run it
```
cd buddy-net
npm install
npm start
```
Shortcuts: Ctrl/⌘ + 1–5 switch era, Ctrl/⌘ + T new tab, Ctrl/⌘ + W close tab, Ctrl/⌘ + L address bar, Ctrl/⌘ + J Buddy AI.

Build with `npm run dist:win` (needs Wine off Windows), `npm run dist:mac` or `npm run dist:linux`.

Screenshots of every era: `SHOTS=/tmp/buddynet xvfb-run -a npx electron --no-sandbox test/shots.js`
(add `SHOT_URL=yahoo.com` to also capture a page in each era).
