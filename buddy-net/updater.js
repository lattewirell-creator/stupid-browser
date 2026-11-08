'use strict';
// Updates for Buddy Net. New versions live in the GitHub release tagged "buddy-net" (a pre-release, so
// The Stupid Browser's own updater never sees it) with files named buddynet*.yml and BuddyNet-*.
// Windows (installer) and Linux (.deb) use electron-updater; Macs use our own swap, since Squirrel.Mac
// needs an Apple Developer ID. Nothing downloads until the user says yes in the era's update prompt.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');

const FEED = 'https://github.com/lattewirell-creator/stupid-browser/releases/download/buddy-net';
const PAGE = 'https://github.com/lattewirell-creator/stupid-browser/releases/tag/buddy-net';
const BUNDLE_ID = 'com.emil.buddynet';
const EVERY = 4 * 60 * 60 * 1000;

const newer = (a, b) => {
  const p = (v) => String(v).split('.').map((n) => parseInt(n, 10) || 0);
  const x = p(a), y = p(b);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
};
const short = (err) => String((err && err.message) || err).split('\n')[0].slice(0, 200);
// A missing feed (nothing released yet) or no network isn't worth alarming anyone about.
const quiet = (msg) => /404|ENOTFOUND|ERR_INTERNET|ERR_NAME|ECONNREFUSED|ETIMEDOUT|timeout|net::/i.test(msg);

module.exports = function startUpdater(send) {
  const state = { status: 'idle', version: null, progress: 0, error: null, current: app.getVersion(), page: PAGE };
  const set = (patch) => { Object.assign(state, patch); send({ ...state }); };
  let impl = null;

  if (process.env.BUDDYNET_FAKE_UPDATE && !app.isPackaged) impl = fakeUpdater(set);
  else if (!app.isPackaged) set({ status: 'dev' });
  else if (process.platform === 'darwin') impl = macUpdater(set);
  else if (process.platform === 'win32' && process.env.PORTABLE_EXECUTABLE_FILE) set({ status: 'manual' });
  else if (process.platform === 'win32' && !fs.existsSync(path.join(path.dirname(process.execPath), `Uninstall ${app.getName()}.exe`))) set({ status: 'manual' });
  else impl = electronUpdater(set);

  const check = () => { if (impl && !['checking', 'downloading', 'ready', 'available'].includes(state.status)) impl.check(); };
  if (impl) { setTimeout(check, 8000); setInterval(check, EVERY).unref(); }

  return {
    state: () => ({ ...state }),
    check: () => { if (impl) check(); return { ...state }; },
    download: () => { if (impl && state.status === 'available') impl.download(); },
    install: () => { if (impl && state.status === 'ready') { set({ status: 'installing' }); setTimeout(() => impl.install(), 1200); } },
    onQuit: () => { if (impl && state.status === 'ready' && impl.installOnQuit) impl.installOnQuit(); }
  };
};

/* ---------- Windows installer and Linux .deb: electron-updater ---------- */
function electronUpdater(set) {
  let autoUpdater;
  try { ({ autoUpdater } = require('electron-updater')); } catch { set({ status: 'manual' }); return null; }
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = null;
  autoUpdater.on('checking-for-update', () => set({ status: 'checking', error: null }));
  autoUpdater.on('update-available', (i) => set({ status: 'available', version: i.version, progress: 0 }));
  autoUpdater.on('update-not-available', () => set({ status: 'none' }));
  autoUpdater.on('download-progress', (p) => set({ status: 'downloading', progress: Math.round(p.percent || 0), speed: p.bytesPerSecond || 0 }));
  autoUpdater.on('update-downloaded', (i) => set({ status: 'ready', version: i.version, progress: 100 }));
  autoUpdater.on('error', (err) => { const m = short(err); set(quiet(m) ? { status: 'none' } : { status: 'error', error: m }); });
  return {
    check: () => autoUpdater.checkForUpdates().catch(() => {}),
    download: () => { set({ status: 'downloading', progress: 0 }); autoUpdater.downloadUpdate().catch(() => {}); },
    install: () => autoUpdater.quitAndInstall(true, true)
  };
}

/* ---------- macOS: download the zip for this chip, check its SHA-512, swap the app on restart ---------- */
function macUpdater(set) {
  const appPath = path.resolve(process.execPath, '..', '..', '..');
  const parent = path.dirname(appPath);
  const run = (cmd, args) => new Promise((res, rej) => execFile(cmd, args, { timeout: 120000 }, (e, out) => (e ? rej(e) : res(String(out).trim()))));
  let found = null, staged = null;

  const writable = () => {
    if (!appPath.endsWith('.app') || /AppTranslocation|^\/Volumes\//.test(appPath)) return false;
    try { fs.accessSync(parent, fs.constants.W_OK); fs.accessSync(appPath, fs.constants.W_OK); return true; } catch { return false; }
  };
  const get = async (url) => {
    const r = await fetch(url, { headers: { 'User-Agent': 'BuddyNet-Updater' }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`Update server answered ${r.status}`);
    return r.text();
  };
  // buddynet-mac.yml: "version: x" and a list of "- url: file / sha512: …" entries.
  const parse = (yml) => {
    const version = (/^version:\s*(\S+)/m.exec(yml) || [])[1];
    const files = {};
    let cur = null;
    for (const line of yml.split('\n')) {
      const u = /^\s*- url:\s*(\S+)/.exec(line);
      if (u) { cur = u[1]; continue; }
      const s = /^\s*sha512:\s*(\S+)/.exec(line);
      if (s && cur && !files[cur]) files[cur] = s[1];
    }
    return { version, files };
  };

  async function check() {
    if (!writable()) { set({ status: 'manual' }); return; }
    set({ status: 'checking', error: null });
    try {
      const { version, files } = parse(await get(`${FEED}/buddynet-mac.yml`));
      if (!version || !newer(version, app.getVersion())) { set({ status: 'none' }); return; }
      const zip = `BuddyNet-mac-${process.arch === 'arm64' ? 'arm64' : 'x64'}.zip`;
      if (!files[zip]) { set({ status: 'none' }); return; }
      found = { version, zip, sha: files[zip] };
      set({ status: 'available', version });
    } catch (err) { const m = short(err); set(quiet(m) ? { status: 'none' } : { status: 'error', error: m }); }
  }

  async function download() {
    const { version, zip, sha } = found;
    set({ status: 'downloading', progress: 0 });
    try {
      const work = path.join(app.getPath('temp'), 'buddy-net-update');
      fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true });
      const zipPath = path.join(work, zip);
      const r = await fetch(`${FEED}/${zip}`, { headers: { 'User-Agent': 'BuddyNet-Updater' } });
      if (!r.ok || !r.body) throw new Error(`Download failed (${r.status})`);
      const size = +r.headers.get('content-length') || 0;
      const out = fs.createWriteStream(zipPath), hash = crypto.createHash('sha512');
      let got = 0, last = -1;
      for await (const chunk of r.body) {
        hash.update(chunk); got += chunk.length;
        if (!out.write(chunk)) await new Promise((res) => out.once('drain', res));
        const pct = size ? Math.floor(got / size * 100) : 0;
        if (pct !== last) { last = pct; set({ status: 'downloading', progress: pct }); }
      }
      await new Promise((res, rej) => out.end((e) => (e ? rej(e) : res())));
      if (hash.digest('base64') !== sha) throw new Error('The download failed its integrity check');
      const stage = path.join(parent, `.buddynet-update-${version}`);
      fs.rmSync(stage, { recursive: true, force: true }); fs.mkdirSync(stage);
      await run('/usr/bin/ditto', ['-x', '-k', zipPath, stage]);
      const name = fs.readdirSync(stage).find((f) => f.endsWith('.app'));
      if (!name) throw new Error('The update is missing the app');
      const plist = path.join(stage, name, 'Contents', 'Info.plist');
      const id = await run('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', plist]);
      const ver = await run('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', plist]);
      if (id !== BUNDLE_ID || ver !== version) throw new Error(`The update is not Buddy Net ${version}`);
      fs.rmSync(work, { recursive: true, force: true });
      staged = { app: path.join(stage, name), stage };
      set({ status: 'ready', version, progress: 100 });
    } catch (err) { set({ status: 'error', error: short(err) }); }
  }

  // Swap the bundles once this process has exited, then (optionally) open the new version.
  function swap(relaunch) {
    if (!staged) return false;
    const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
    const bak = appPath + '.old';
    const script = [
      `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.3; done`,
      `rm -rf ${q(bak)}`,
      `if mv ${q(appPath)} ${q(bak)}; then`,
      `  if mv ${q(staged.app)} ${q(appPath)}; then rm -rf ${q(bak)}; else mv ${q(bak)} ${q(appPath)}; fi`,
      'fi',
      `rm -rf ${q(staged.stage)}`,
      `xattr -dr com.apple.quarantine ${q(appPath)} 2>/dev/null`,
      relaunch ? `open ${q(appPath)}` : ':'
    ].join('\n');
    spawn('/bin/sh', ['-c', script], { detached: true, stdio: 'ignore' }).unref();
    staged = null;
    return true;
  }

  return {
    check, download,
    install: () => { if (swap(true)) app.quit(); },
    installOnQuit: () => swap(false)
  };
}

/* ---------- Development only: walk through the whole flow without a real release ---------- */
function fakeUpdater(set) {
  let timer = null;
  return {
    check: () => { set({ status: 'checking' }); setTimeout(() => set({ status: 'available', version: '9.9.9' }), 1200); },
    download: () => {
      let p = 0;
      set({ status: 'downloading', progress: 0 });
      clearInterval(timer);
      timer = setInterval(() => {
        p = Math.min(100, p + 4);
        if (p < 100) set({ status: 'downloading', progress: p, speed: 3600 });
        else { clearInterval(timer); set({ status: 'ready', progress: 100 }); }
      }, 250);
    },
    install: () => set({ status: 'none', version: null })
  };
}
