'use strict';
// Automatic updates for macOS without an Apple Developer ID (Squirrel.Mac requires one).
// Checks GitHub Releases, downloads the zip for this Mac's chip, verifies its SHA-512 against the
// release's latest-mac.yml, unpacks it next to the installed app, and swaps the app bundle when
// the browser quits (or on "Restart to update").
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');

const REPO = 'lattewirell-creator/stupid-browser';
const BUNDLE_ID = 'com.emil.stupidbrowser';
// Self-tests can point at a local feed (loopback only).
const TEST_FEED = /^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.STUPID_UPDATE_TEST_FEED || '') ? process.env.STUPID_UPDATE_TEST_FEED : null;
const run = (cmd, args) => new Promise((resolve, reject) => execFile(cmd, args, { timeout: 120000 }, (err, out) => (err ? reject(err) : resolve(String(out).trim()))));
const newer = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };

module.exports = function macUpdater({ setUpdate, log = console.log, afterSwap = () => null }) {
  const appPath = path.resolve(process.execPath, '..', '..', '..');          // …/The Stupid Browser.app
  const parent = path.dirname(appPath);
  let staged = null;    // { version, app: path to the unpacked new .app }
  let busy = false;

  // Can we replace the app where it lives? Not from a disk image or App Translocation's read-only copy.
  function installable() {
    if (!appPath.endsWith('.app') || /AppTranslocation|^\/Volumes\//.test(appPath)) return false;
    try { fs.accessSync(parent, fs.constants.W_OK); fs.accessSync(appPath, fs.constants.W_OK); return true; } catch { return false; }
  }
  async function getJSON(url) {
    const r = await fetch(url, { headers: { 'User-Agent': 'TheStupidBrowser-Updater', Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`Update server answered ${r.status}`);
    return r.json();
  }
  async function getText(url) {
    const r = await fetch(url, { headers: { 'User-Agent': 'TheStupidBrowser-Updater' }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`Download failed (${r.status})`);
    return r.text();
  }
  // latest-mac.yml lists each file with its sha512 (base64); a tiny parser is enough for that shape.
  function shaFor(yml, file) {
    const lines = yml.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === `- url: ${file}`) {
        for (let j = i + 1; j < lines.length && !lines[j].trim().startsWith('- url:'); j++) { const m = /^\s*sha512:\s*(\S+)/.exec(lines[j]); if (m) return m[1]; }
      }
    }
    return null;
  }
  async function download(url, dest, total) {
    const r = await fetch(url, { headers: { 'User-Agent': 'TheStupidBrowser-Updater' } });
    if (!r.ok || !r.body) throw new Error(`Download failed (${r.status})`);
    const size = +r.headers.get('content-length') || total || 0;
    const out = fs.createWriteStream(dest); const hash = crypto.createHash('sha512');
    let got = 0, lastPct = -1;
    for await (const chunk of r.body) {
      hash.update(chunk); got += chunk.length;
      if (!out.write(chunk)) await new Promise((res) => out.once('drain', res));
      const pct = size ? Math.floor(got / size * 100) : 0;
      if (pct !== lastPct) { lastPct = pct; setUpdate({ status: 'downloading', progress: pct }); }
    }
    await new Promise((res, rej) => out.end((e) => (e ? rej(e) : res())));
    return hash.digest('base64');
  }

  async function check() {
    if (busy || staged) return;
    if (!installable()) { setUpdate({ status: 'manual', error: null }); return; }
    busy = true;
    setUpdate({ status: 'checking', error: null });
    try {
      const rel = TEST_FEED ? await getJSON(TEST_FEED + '/releases/latest') : await getJSON(`https://api.github.com/repos/${REPO}/releases/latest`);
      const version = String(rel.tag_name || '').replace(/^v/, '');
      if (!/^\d+\.\d+\.\d+$/.test(version) || !newer(version, app.getVersion())) { setUpdate({ status: 'none', lastCheck: Date.now() }); return; }
      const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
      const asset = (name) => (rel.assets || []).find((a) => a.name === name);
      const zipName = `StupidBrowser-${version}-${arch}.zip`;
      const zip = asset(zipName), yml = asset('latest-mac.yml');
      if (!zip || !yml) { setUpdate({ status: 'none', lastCheck: Date.now() }); log('[updater] release has no mac zip yet'); return; }
      const expected = shaFor(await getText(yml.browser_download_url), zipName);
      if (!expected) throw new Error('Update has no checksum');
      setUpdate({ status: 'downloading', version, progress: 0 });
      const work = path.join(app.getPath('temp'), 'stupid-browser-update'); fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
      const zipPath = path.join(work, zipName);
      const sha = await download(zip.browser_download_url, zipPath, zip.size);
      if (sha !== expected) throw new Error('Downloaded update failed its integrity check');
      // Unpack next to the installed app (same disk → the final swap is an instant rename).
      const stage = path.join(parent, `.stupid-update-${version}`);
      fs.rmSync(stage, { recursive: true, force: true }); fs.mkdirSync(stage);
      await run('/usr/bin/ditto', ['-x', '-k', zipPath, stage]);
      const name = fs.readdirSync(stage).find((f) => f.endsWith('.app'));
      if (!name) throw new Error('Update is missing the app');
      const newApp = path.join(stage, name);
      const plist = path.join(newApp, 'Contents', 'Info.plist');
      const id = await run('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', plist]);
      const ver = await run('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', plist]);
      if (id !== BUNDLE_ID || ver !== version) throw new Error('Update is not The Stupid Browser ' + version);
      // (No codesign check: an ad-hoc signature says nothing about who built it. The SHA-512 above is the integrity check.)
      fs.rmSync(work, { recursive: true, force: true });
      staged = { version, app: newApp, stage };
      setUpdate({ status: 'ready', version, progress: 100, lastCheck: Date.now() });
    } catch (err) {
      setUpdate({ status: 'error', error: String(err && err.message || err).slice(0, 200), lastCheck: Date.now() });
    } finally { busy = false; }
  }

  // Swap the bundles after this process exits, then optionally reopen the new version.
  function install(relaunch) {
    if (!staged) return false;
    const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
    const bak = appPath + '.old';
    const udd = process.argv.find((x) => x.startsWith('--user-data-dir='));   // keep a custom data folder (tests)
    const script = [
      `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.3; done`,
      `rm -rf ${q(bak)}`,
      `if mv ${q(appPath)} ${q(bak)}; then`,
      `  if mv ${q(staged.app)} ${q(appPath)}; then rm -rf ${q(bak)}; else mv ${q(bak)} ${q(appPath)}; fi`,
      `fi`,
      `rm -rf ${q(staged.stage)}`,
      `xattr -dr com.apple.quarantine ${q(appPath)} 2>/dev/null`,
      ...(afterSwap(appPath) || []),   // keep a custom app name / icon (mac-brand.js)
      `[ -n "$T" ] || T=${q(appPath)}`,
      relaunch ? `open "$T"${udd ? ' --args ' + q(udd) : ''}` : ':'
    ].join('\n');
    spawn('/bin/sh', ['-c', script], { detached: true, stdio: 'ignore' }).unref();
    staged = null;
    return true;
  }

  return {
    checkForUpdates: () => check(),
    quitAndInstall: () => { if (install(true)) app.quit(); },
    installOnQuit: () => install(false)
  };
};
