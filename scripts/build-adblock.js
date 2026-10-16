// Fetch Ghostery's prebuilt ads+tracking lists and bundle a serialized engine with the app.
const { ElectronBlocker } = require('@ghostery/adblocker-electron');
const fs = require('fs');
const path = require('path');
(async () => {
  const blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
  const out = path.join(__dirname, '..', 'src', 'assets', 'adblock.bin');
  fs.writeFileSync(out, blocker.serialize());
  console.log('wrote', out, fs.statSync(out).size, 'bytes');
})().catch((e) => { console.error(e); process.exit(1); });
