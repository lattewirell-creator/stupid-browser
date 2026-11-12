'use strict';
// Where the browser keeps your data (history, cookies, passwords, every profile…). Normally the usual app-data folder
// (HOME); it can be moved to another disk in Settings. A small note in HOME (data-location.json) says where it is.
//
// Safety first, because this is all of someone's data:
//  - The copy happens on a start where Chromium runs in an empty scratch folder, so nothing in your data is open.
//  - Every file is checked (name and size) in the copy; any error stops the move and leaves the original untouched.
//  - The old copy is removed only on a later start that is really running from the new place, never while the new
//    place is missing, and never anything that contains the place in use.
//  - If the data's disk is missing at start, you're asked (try again / quit / start from the usual folder) instead of
//    silently starting somewhere else.
// Required at the very top (profiles.js), before anything uses userData.
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, execFile } = require('child_process');

if (process.env.STUPID_DATA_HOME && (!app.isPackaged || process.env.STUPID_SELFTEST)) app.setPath('userData', process.env.STUPID_DATA_HOME);   // tests only
const CUSTOM = process.argv.some((a) => a.startsWith('--user-data-dir='));   // dev/tests: a folder given by hand wins
const HOME = app.getPath('userData');
const POINTER = path.join(HOME, 'data-location.json');
const MARK = '.stupid-data';
// While copying (or waiting for a missing disk) Chromium runs here, so it doesn't open anything in your data. Fixed, so
// a second start of the browser meanwhile shares its single-instance lock and just stops.
// Next to HOME (inside this user's own app-data folder), so no other account can get at it.
const SCRATCH = path.join(path.dirname(HOME), path.basename(HOME) + ' (moving)');
// Caches come back by themselves, so they aren't copied (that's most of the size and time).
const SKIP = new Set(['Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'GrShaderCache', 'ShaderCache', 'GraphiteDawnCache', 'GPUPersistentCache', 'Crashpad', 'data-location.json', 'move.lock', MARK, 'lockfile', 'SingletonLock', 'SingletonCookie', 'SingletonSocket']);
const WIN = process.platform === 'win32';
const same = (a, b) => (WIN ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b));
const inside = (a, b) => { const r = path.relative(b, a); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };   // a is b or within b
const overlap = (a, b) => inside(a, b) || inside(b, a);
// The real place behind a path (a subst drive, junction, link or short name can point at the same folder).
function real(p) { try { return fs.realpathSync.native(p); } catch { return path.resolve(p); } }
const overlapReal = (a, b) => overlap(a, b) || overlap(real(a), real(b));

const dlog = (...a) => { if (process.env.STUPID_DATA_LOG) try { fs.appendFileSync(process.env.STUPID_DATA_LOG, `[${process.pid}] ${a.join(' ')}\n`); } catch {} };
function readPointer() { try { const p = JSON.parse(fs.readFileSync(POINTER, 'utf8')); return p && typeof p === 'object' ? p : {}; } catch { return {}; } }
function writePointer(p) {
  const clean = {}; for (const k of ['dir', 'pending', 'cleanup', 'movedTo', 'error']) if (p[k]) clean[k] = p[k];
  if (clean.dir && same(clean.dir, HOME)) delete clean.dir;
  fs.mkdirSync(HOME, { recursive: true });
  if (!Object.keys(clean).length) { try { fs.rmSync(POINTER, { force: true }); } catch {} return; }
  const tmp = POINTER + '.tmp';
  const fd = fs.openSync(tmp, 'w'); try { fs.writeSync(fd, JSON.stringify(clean)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, POINTER);
}

const state = { home: HOME, dir: HOME, pending: null, missing: null, cleanup: null };
if (!CUSTOM) {
  const p = readPointer();
  if (typeof p.dir === 'string' && p.dir && !same(p.dir, HOME)) {
    if (fs.existsSync(path.join(p.dir, MARK))) state.dir = p.dir; else state.missing = p.dir;
  }
  if (!state.missing && p.pending && typeof p.pending.to === 'string' && typeof p.pending.from === 'string' && same(p.pending.from, state.dir)) state.pending = p.pending;
  // The old copy goes only when the data really runs from somewhere else, and only if the two don't overlap.
  if (!state.missing && typeof p.cleanup === 'string' && p.cleanup && !overlapReal(p.cleanup, state.dir) && !(fs.existsSync(p.cleanup) && overlapReal(p.cleanup, SCRATCH))) state.cleanup = p.cleanup;
  dlog('start', JSON.stringify(p), JSON.stringify(state));
  if (state.pending || state.missing) { fs.mkdirSync(SCRATCH, { recursive: true }); app.setPath('userData', SCRATCH); }
  else if (!same(state.dir, HOME)) app.setPath('userData', state.dir);
}

// This Windows user's security id (names can fail to resolve; ids can't).
function mySid() {
  const out = execFileSync('whoami', ['/user', '/fo', 'csv', '/nh'], { windowsHide: true, encoding: 'utf8' });
  const m = /"(S-1-[0-9-]+)"/.exec(out); if (!m) throw new Error('no user id'); return m[1];
}
// A new folder only this user (and the system) can open: at the top of a disk it would otherwise be readable by every
// account on the computer. Always made fresh, never someone else's existing folder.
function makePrivateDir(parent, name) {
  for (let n = 1; n < 20; n++) {
    const dir = path.join(parent, n === 1 ? name : `${name} ${n}`);
    try { fs.mkdirSync(dir); } catch (e) { if (e.code === 'EEXIST') continue; throw e; }
    try {
      if (WIN) execFileSync('icacls', [dir, '/inheritance:r', '/grant:r', `*${mySid()}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F'], { windowsHide: true, stdio: 'ignore' });
      else fs.chmodSync(dir, 0o700);
    } catch (e) { try { fs.rmdirSync(dir); } catch {} throw new Error('Couldn’t protect the new folder'); }
    return dir;
  }
  throw new Error('Couldn’t make a folder there');
}

// Every file under dir (caches and links left out). strict: any folder it can't read is an error, not a skip.
async function list(dir, strict) {
  const out = [];
  async function go(d) {
    let entries;
    try { entries = await fs.promises.readdir(d, { withFileTypes: true }); } catch (e) { if (strict) throw new Error(`can't read ${path.relative(dir, d) || 'the folder'}`); return; }
    for (const e of entries) {
      if (SKIP.has(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) await go(p);
      else if (e.isFile()) { let size = 0; try { size = (await fs.promises.stat(p)).size; } catch (err) { if (strict) throw new Error(`can't read ${e.name}`); } out.push({ rel: path.relative(dir, p), size }); }
    }
  }
  await go(dir);
  return out;
}
async function sizeOf(dir) { return (await list(dir, false)).reduce((n, f) => n + f.size, 0); }
function freeOn(dir) { try { const s = fs.statfsSync(dir); return s.bavail * s.bsize; } catch { return Infinity; } }

// Local disks on Windows (network, removable and CD drives left out).
let drivesCache = null, drivesAt = 0;
function windowsDrives() {
  if (!WIN) return Promise.resolve([]);
  if (drivesCache && Date.now() - drivesAt < 30000) return Promise.resolve(drivesCache);
  return new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -eq 3 } | ForEach-Object { $_.DeviceID + "|" + $_.FreeSpace + "|" + $_.Size }'], { windowsHide: true, encoding: 'utf8', timeout: 15000 }, (err, out) => {
      if (err) return resolve(drivesCache || []);
      drivesCache = String(out).split(/\r?\n/).map((l) => l.trim().split('|')).filter((x) => /^[A-Z]:$/i.test(x[0] || '')).map(([id, free, size]) => ({ root: id.toUpperCase() + '\\', free: +free || 0, total: +size || 0 }));
      drivesAt = Date.now(); resolve(drivesCache);
    });
  });
}

// Settings → "Move…": checks, makes the folder, and restarts into the copy step.
async function requestMove(where, { otherProfilesOpen } = {}) {
  if (CUSTOM) throw new Error('Not available when started with a custom data folder');
  if (otherProfilesOpen) throw new Error('Close your other profiles first, then try again');
  const from = state.dir;
  const backHome = where === 'home';
  let parent = backHome ? HOME : where;
  if (!backHome) {
    if (typeof parent !== 'string' || !path.isAbsolute(parent) || !fs.existsSync(parent)) throw new Error('That place can’t be found');
    if (WIN) {
      if (/^\\\\/.test(parent)) throw new Error('A network folder can’t hold your data');
      const root = path.parse(parent).root.toUpperCase();
      if (!(await windowsDrives()).some((d) => d.root === root)) throw new Error('Pick a folder on one of this computer’s own disks');
    }
    const isRootOfFrom = same(parent, path.parse(from).root) && same(real(parent), path.parse(real(from)).root);
    if (overlapReal(parent, from) && !isRootOfFrom) throw new Error('Pick a place outside the current data folder');
    if (inside(parent, HOME) || inside(real(parent), real(HOME)) || overlapReal(parent, SCRATCH)) throw new Error('Pick a place outside the usual data folder');
  } else if (same(from, HOME)) throw new Error('Your data is already in the usual folder');
  const need = (await sizeOf(from)) * 1.1 + 100 * 1024 * 1024;
  if (freeOn(parent) < need) throw new Error(`Not enough room there: it needs about ${Math.ceil(need / 1048576)} MB`);
  const to = backHome ? HOME : makePrivateDir(parent, 'The Stupid Browser data');
  if (overlapReal(to, from)) { if (!backHome) { try { fs.rmdirSync(to); } catch {} } throw new Error('Pick a place outside the current data folder'); }
  dlog('request ok', from, to);
  writePointer(Object.assign(readPointer(), { pending: { from, to, tries: 0 }, error: null, movedTo: null }));
  app.relaunch(); app.exit(0);
}

// The start after "Move…": Chromium runs in the scratch folder, so `from` is closed. Copy, check every file, then point
// at the new place and start again. Any problem: the copy goes, the original stays, and you're told.
async function runPendingMove({ otherProfilesOpen } = {}) {
  const { from, to } = state.pending;
  const p0 = readPointer();
  const tries = ((p0.pending && p0.pending.tries) || 0) + 1;
  // Only one copy at a time (another start of the browser, another profile).
  const LOCK = path.join(HOME, 'move.lock');
  try { const st = fs.statSync(LOCK); if (Date.now() - st.mtimeMs < 10 * 60000) { app.exit(0); return; } fs.rmSync(LOCK, { force: true }); } catch {}
  try { fs.closeSync(fs.openSync(LOCK, 'wx')); } catch { app.exit(0); return; }
  const unlock = () => { try { fs.rmSync(LOCK, { force: true }); } catch {} };
  const giveUp = (msg) => {
    if (!same(to, HOME)) { try { fs.rmSync(to, { recursive: true, force: true }); } catch {} }
    writePointer(Object.assign(readPointer(), { pending: null, error: `Moving your data didn’t work (${msg}). Everything is still where it was.` }));
  };
  if (tries > 2) { giveUp('it stopped twice'); unlock(); app.relaunch(); app.exit(0); return; }   // it crashed mid-copy before: don't loop
  writePointer(Object.assign(p0, { pending: Object.assign({}, p0.pending, { tries }) }));
  const win = new BrowserWindow({ width: 420, height: 190, frame: false, resizable: false, show: true, backgroundColor: '#FAF6F0', webPreferences: { sandbox: true, contextIsolation: true } });
  const page = `<!doctype html><meta charset="utf-8"><body style="margin:0;font:14px 'Segoe UI',system-ui,sans-serif;background:#FAF6F0;color:#29251E;display:grid;place-items:center;height:100vh;-webkit-app-region:drag">
<div style="text-align:center;width:320px"><div style="font-size:18px;font-weight:600">Moving your data</div><div id="s" style="color:#8A8276;margin:6px 0 16px;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">To ${to.replace(/[<&>"]/g, '')}</div>
<div style="height:5px;border-radius:3px;background:#E8E0D4;overflow:hidden"><i id="b" style="display:block;height:100%;width:0;background:#D97757;transition:width .2s"></i></div></div>`;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(page)).catch(() => {});
  const show = (pct, text) => { if (!win.isDestroyed()) win.webContents.executeJavaScript(`b.style.width='${pct}%';${text ? `s.textContent=${JSON.stringify(text)};` : ''}`).catch(() => {}); };
  try {
    if (otherProfilesOpen) throw new Error('another profile was open');
    if (overlapReal(from, to) && !(same(to, HOME) && !overlapReal(from, HOME))) throw new Error('the two places overlap');
    if (!fs.existsSync(to)) throw new Error('the new folder is gone');
    // Back to the usual folder: whatever is left there from before (an old copy that couldn't be cleared) goes first,
    // so old files never sit next to the current ones.
    if (same(to, HOME)) for (const e of await fs.promises.readdir(HOME)) if (!['data-location.json', 'data-location.json.tmp', 'move.lock'].includes(e)) await fs.promises.rm(path.join(HOME, e), { recursive: true, force: true, maxRetries: 3 });
    const files = await list(from, true);
    const total = Math.max(1, files.reduce((n, f) => n + f.size, 0));
    let done = 0, last = -1;
    for (const f of files) {
      const dest = path.join(to, f.rel);
      await fs.promises.mkdir(path.dirname(dest), { recursive: true });
      await fs.promises.copyFile(path.join(from, f.rel), dest);
      done += f.size; const pct = Math.round(done / total * 100); if (pct !== last) { last = pct; show(pct); }
    }
    // Every file is there, at its size.
    for (const f of files) { const st = await fs.promises.stat(path.join(to, f.rel)).catch(() => null); if (!st || st.size !== f.size) throw new Error(`the copy of ${path.basename(f.rel)} isn't right`); }
    fs.writeFileSync(path.join(to, MARK), '');
    show(100, 'Done. Starting…');
    writePointer({ dir: to, cleanup: from, movedTo: to }); dlog('copied', files.length);
  } catch (e) {
    dlog('copy failed', e.message);
    giveUp(e.message);
  }
  unlock();
  await new Promise((r) => setTimeout(r, 700));
  app.relaunch(); app.exit(0);
}

// The data's disk isn't there (unplugged, locked). Never start somewhere else silently: that would split your data in two.
async function askAboutMissing() {
  const r = await dialog.showMessageBox({ type: 'warning', title: 'The Stupid Browser', message: 'Your data can’t be found', detail: `It’s in ${state.missing}. Is that disk plugged in and unlocked?\n\nYou can also start from the usual folder instead; then the data on that disk is left as it is and isn’t used.`, buttons: ['Try again', 'Start from the usual folder', 'Quit'], defaultId: 0, cancelId: 2, noLink: true });
  if (r.response === 0) { app.relaunch(); app.exit(0); return; }
  if (r.response === 1) { const p = readPointer(); delete p.dir; delete p.cleanup; delete p.pending; writePointer(p); app.relaunch(); app.exit(0); return; }
  app.exit(0);
}

// After a move: the old copy goes (in the usual folder, everything but this note).
async function clearOld() {
  const old = state.cleanup;
  if (!old || state.missing || overlapReal(old, state.dir) || !fs.existsSync(path.join(state.dir, MARK)) && !same(state.dir, HOME)) return;
  try {
    if (same(old, HOME)) { for (const e of await fs.promises.readdir(old)) if (e !== 'data-location.json' && e !== 'data-location.json.tmp') await fs.promises.rm(path.join(old, e), { recursive: true, force: true, maxRetries: 3 }); }
    else await fs.promises.rm(old, { recursive: true, force: true, maxRetries: 3 });
  } catch (e) { console.error('old data cleanup', e.message); return; }
  const p = readPointer(); delete p.cleanup; writePointer(p);
}
// The scratch folder from a move (or a missing-disk start) isn't needed on a normal start.
async function removeScratch() { if (state.pending || state.missing || same(app.getPath('userData'), SCRATCH)) return; try { await fs.promises.rm(SCRATCH, { recursive: true, force: true, maxRetries: 3 }); } catch {} }
function takeNotice() { const p = readPointer(); const n = { movedTo: p.movedTo || null, error: p.error || null }; if (n.movedTo || n.error) { delete p.movedTo; delete p.error; writePointer(p); } return n; }

module.exports = { SCRATCH, removeScratch, state, requestMove, runPendingMove, askAboutMissing, clearOld, takeNotice, sizeOf, freeOn, windowsDrives, HOME };
