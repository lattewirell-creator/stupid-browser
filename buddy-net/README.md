# Buddy Net

A time-travelling web browser. Pick an era in the **Time Machine** bar at the bottom and the whole browser changes with it:
the window, the toolbar, the sounds and the web itself.

| Era | Browser | What it's like |
|---|---|---|
| **90s** (1996–1999) | Buddy Net Navigator | Grey bevelled Windows 95 chrome, big labelled buttons, a "Location:" field, the shooting-star throbber, an Images on/off button, and a dial-up modem handshake when you connect. |
| **2000s** (2000–2005) | Buddy Net Explorer | Windows XP blue title bar, round green Back/Forward buttons, an "Address" bar with Go, a Links bar, a junk BuddyBar™ toolbar, the yellow pop-up blocker bar, and an XP-style taskbar. |
| **Early Chrome** (2006–2009) | Buddy Net Chrome | Blue frame with slanted tabs on top, one omnibox, a wrench menu and a "Most visited" thumbnail new tab page. |
| **2010s Labs** (2010–2016) | Buddy Net Labs | Flat, colourful start-screen tiles, a social bar (Like, Tweet, +1, Pin it) and a Labs panel full of experiments: Instafilter, 3D Web, Night Mode and leather-and-stitches skeuomorphism. |
| **AI 2020s** (today) | Buddy Net AI | Dark and rounded, "Ask Buddy or type a URL", AI insight pills and the Buddy AI sidebar that summarizes, explains or answers questions about the page you're on. |

## Time travel
In the four older eras every page loads from the [Wayback Machine](https://web.archive.org) as it looked in the year shown
in the Time Machine (use ◀ ▶ to pick another year in that era). Links you click, and results from searches, stay in that year.
Turn it off under ⚙ ("Time-travel pages") to browse today's web in an old browser. The 2020s always show the live web.

## Buddy AI
Works out of the box with an offline summarizer that reads the page. For real answers, paste an Anthropic API key under ⚙
(it's stored only on your computer) or start the app with `ANTHROPIC_API_KEY` set, and Buddy answers with Claude.

## Run it
```
cd buddy-net
npm install
npm start
```
Shortcuts: Ctrl/⌘ + 1–5 switch era, Ctrl/⌘ + T new tab, Ctrl/⌘ + W close tab, Ctrl/⌘ + L address bar, Ctrl/⌘ + J Buddy AI.

Build an installer with `npm run dist:win`, `npm run dist:mac` or `npm run dist:linux`.

Screenshots of every era: `SHOTS=/tmp/buddynet xvfb-run -a npx electron --no-sandbox test/shots.js`
(add `SHOT_URL=yahoo.com` to also capture a page in each era).
