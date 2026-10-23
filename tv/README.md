# Stupid TV

A calm home screen for a Samsung Smart Monitor or Samsung TV. It shows a big clock, the weather, and your apps and
websites as large tiles you can reach with the remote. It's a Tizen web app: plain HTML, CSS and JavaScript, no build step.

Samsung doesn't let any app replace the monitor's own home bar. Stupid TV is an app you open from that bar. Move it to
the first spot and it's one click away whenever you turn the monitor on.

## Using it with the remote
- **Arrows** move between tiles. **OK** opens the app or website.
- **Hold OK** on a tile (or press the red button, if your remote has one) to move it, rename it or remove it.
- **Add** at the end of each row adds an app or a website.
- The **gear** at the top right (or the blue button) holds settings: your name for the greeting, the city for the
  weather, 12/24-hour clock, the color, and the screensaver.
- In a text field, **OK** opens the on-screen keyboard and its **Done** moves on. Settings save as you leave them.
- **Back** closes a dialog. On the home screen, Back hides Stupid TV, which keeps running so it opens instantly next time.

An app tile opens the Samsung app when it's installed. When it isn't, the tile opens the service's website in the
monitor's own browser. The app IDs differ between monitor generations, so if a tile opens the website and you'd rather
have the app, hold OK → **Edit name and address** and enter the right app ID.

## Try it on a computer first
Open `tv/index.html` in Chrome. Arrows and Enter work like the remote, Backspace or Esc is Back, E edits a tile and S
opens settings. The page shrinks to fit the window. Apps can't open from a computer, so every tile opens its website.

## Install it on the monitor
You do this once. It takes about 20 minutes, mostly downloads.

You need a Mac or Linux computer on the same network as the monitor (on Windows, use Git Bash or WSL for step 5).

1. **Install Tizen Studio** (the full version with the IDE, not just the command line tools) from
   [developer.samsung.com/smarttv](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html).
   In its Package Manager, add **TV Extensions** and **Samsung Certificate Extension** under "Extension SDK".
   Then, in the terminal you'll use for the rest, run:

   ```bash
   export PATH="$HOME/tizen-studio/tools:$HOME/tizen-studio/tools/ide/bin:$PATH"
   ```
2. **Find the monitor's IP address:** Settings → General → Network → Network Status → IP Settings.
3. **Turn on developer mode on the monitor:** open **Apps**, then type **1 2 3 4 5**. Smart Monitor remotes have no
   number keys: press the **123** button (on some remotes you hold it) to get numbers on the screen. Switch
   Developer mode **On**, enter your computer's IP address, and restart the monitor (hold the power button until it
   turns off and on again).
4. **Make a Samsung certificate:** in Tizen Studio open Tools → Certificate Manager → **+** → **Samsung** → **TV**,
   and name the profile `stupidtv`. Sign in with a free Samsung account when asked. Connect the monitor first
   (`sdb connect <monitor-ip>`) so it's added to the certificate automatically.
5. **Install:** from the repository folder run

   ```bash
   bash tv/install.sh <monitor-ip>
   ```

   Stupid TV opens on the monitor when it's done. Run the same command again after changing anything.
6. On the monitor, go to the app in the home bar, press **down** (or hold OK) → **Move**, and put it first.

## Files
- `index.html`, `css/style.css`: the screen, designed at 1920×1080 with a TV-safe margin.
- `js/data.js`: the default rows and Samsung app IDs.
- `js/nav.js`: moving between tiles with the arrow keys.
- `js/app.js`: tiles, opening apps, dialogs, weather ([Open-Meteo](https://open-meteo.com), free, no account),
  screensaver. Everything you change is saved on the monitor.
- `config.xml`: the Tizen app manifest. `install.sh`: build, sign and install.
