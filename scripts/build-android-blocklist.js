// Build android/app/src/main/assets/blocklist.txt: plain ad/tracker domains from EasyList + EasyPrivacy
// (rules of the form ||domain^ or ||domain^$third-party). Domains with an @@ exception are left out.
const fs = require('fs');
const path = require('path');
const LISTS = ['https://ublockorigin.github.io/uAssets/thirdparties/easylist.txt', 'https://ublockorigin.github.io/uAssets/thirdparties/easyprivacy.txt'];
(async () => {
  // The biggest ad/tracking networks, which the lists mostly cover with longer rules.
  const block = new Set(['doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'adservice.google.com', 'pagead2.googlesyndication.com',
    'amazon-adsystem.com', 'adnxs.com', 'criteo.com', 'criteo.net', 'taboola.com', 'outbrain.com', 'scorecardresearch.com', 'moatads.com',
    'rubiconproject.com', 'pubmatic.com', 'openx.net', 'casalemedia.com', 'adsrvr.org', 'quantserve.com', 'hotjar.com', 'google-analytics.com',
    'googletagmanager.com', 'googletagservices.com', 'ads-twitter.com', 'ads.linkedin.com', 'connect.facebook.net', 'analytics.tiktok.com', 'adform.net', 'smartadserver.com']);
  const allow = new Set();
  for (const url of LISTS) {
    const text = await (await fetch(url)).text();
    for (const line of text.split('\n')) {
      const m = /^(@@)?\|\|([a-z0-9.-]+\.[a-z]{2,})\^(\$third-party)?$/.exec(line.trim());
      if (m) (m[1] ? allow : block).add(m[2]);
    }
  }
  const out = [...block].filter((d) => ![...allow].some((a) => a === d || a.endsWith('.' + d))).sort();
  const file = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'blocklist.txt');
  fs.writeFileSync(file, out.join('\n') + '\n');
  console.log('wrote', out.length, 'domains to', file);
})().catch((e) => { console.error(e); process.exit(1); });
