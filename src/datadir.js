'use strict';
// Where the browser keeps your data (history, cookies, passwords, profiles…). Normally the usual app-data folder; it
// can be moved to another disk in Settings. A small note in the usual folder (data-location.json) says where it is.
// A move happens in two starts: the first copies everything (with a progress window) and points the note at the new
// place, the second starts there and clears the old copy. Required at the very top (before anything uses userData).
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

if (process.env.STUPID_DATA_HOME) app.setPath('userData', process.env.STUPID_DATA_HOME);   // tests
const CUSTOM = process.argv.some((a) => a.startsWith('--user-data-dir='));   // dev/tests: a folder given by hand wins
const HOME = app.getPath('userData');
const POINTER = path.join(HOME, 'data-location.json');
// Caches come back by themselves, so they aren't copied (that's most of the size and time).
const SKIP = new Set(['Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'GrShaderCache', 'ShaderCache', 'GraphiteDawnCache', 'Crashpad', 'data-location.json', '.stupid-data', 'lockfile', 'SingletonLock', 'SingletonCookie', 'SingletonSocket']);

function readPointer() { try { const p = JSON.parse(fs.readFileSync(POINTER, 'utf8')); return p && typeof p === 'object' ? p : {}; } catch { return {}; } }
function writePointer(p) {
  fs.mkdirSync(HOME, { recursive: true });
  if (!p.dir || p.dir === HOME) { if (!p.pending && !p.cleanup) { try { fs.rmSync(POINTER, { force: true }); } catch {} return; } }
  fs.writeFileSync(POINTER + '.tmp', JSON.stringify(p)); fs.renameSync(POINTER + '.tmp', POINTER);
}

const state = { home: HOME, dir: HOME, pending: null, missing: null, cleanup: null, moved: false, error: null };
if (!CUSTOM) {
  const p = readPointer();
  if (typeof p.dir === 'string' && p.dir && p.dir !== HOME) { if (fs.existsSync(path.join(p.dir, '.stupid-data'))) state.dir = p.dir; else state.missing = p.dir; }
  if (p.pending && typeof p.pending.to === 'string' && p.pending.from === state.dir) state.pending = p.pending;
  if (typeof p.cleanup === 'string' && p.cleanup && p.cleanup !== state.dir) state.cleanup = p.cleanup;
  if (p.movedTo) state.moved = p.movedTo;
  if (p.error) state.error = p.error;
  if (state.dir !== HOME) app.setPath('userData', state.dir);
}

const inside = (a, b) => { const r = path.relative(b, a); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };

// A new folder only this Windows user (and the system) can open: at the top of a disk it would otherwise be readable
// by every account on the computer. Made fresh (never someone else's existing folder).
function makePrivateDir(parent, name) {
  fs.mkdirSync(parent, { recursive: true });
  for (let n = 1; n < 20; n++) {
    const dir = path.join(parent, n === 1 ? name : `${name} ${n}`);
    try { fs.mkdirSync(dir); } catch (e) { if (e.code === 'EEXIST') continue; throw e; }
    if (process.platform === 'win32') {
      const me = `${process.env.USERDOMAIN || '.'}\\${process.env.USERNAME}`;
      execFileSync('icacls', [dir, '/inheritance:r', '/grant:r', `${me}:(OI)(CI)F`, '*S-1-5-18:(OI)(CI)F', '*S-1-5-32-544:(OI)(CI)F'], { windowsHide: true, stdio: 'ignore' });
    } else fs.chmodSync(dir, 0o700);
    return dir;
  }
  throw new Error('Couldn’t make a folder there');
}

async function walk(dir, onFile) {
  let entries; try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p, onFile);
    else if (e.isFile()) { let size = 0; try { size = (await fs.promises.stat(p)).size; } catch {} await onFile(p, size); }
  }
}
async function sizeOf(dir) { let n = 0; await walk(dir, (_p, s) => { n += s; }); return n; }
function freeOn(dir) { try { const s = fs.statfsSync(dir); return s.bavail * s.bsize; } catch { return Infinity; } }

// Settings → "Move…": checks, makes the folder, and restarts into the copy step.
async function requestMove(parent, { otherProfilesOpen } = {}) {
  if (CUSTOM) throw new Error('Not available when started with a custom data folder');
  if (otherProfilesOpen) throw new Error('Close your other profiles first, then try again');
  const from = state.dir;
  const backHome = parent === 'home';
  if (!backHome && (typeof parent !== 'string' || !path.isAbsolute(parent) || !fs.existsSync(parent))) throw new Error('That place can’t be found');
  if (!backHome && (inside(parent, from) || inside(from, parent) && parent !== path.parse(from).root)) throw new Error('Pick a place outside the current data folder');
  const need = (await sizeOf(from)) * 1.1 + 100 * 1024 * 1024;
  const room = freeOn(backHome ? HOME : parent);
  if (room < need) throw new Error(`Not enough room there: it needs about ${Math.ceil(need / 1048576)} MB`);
  const to = backHome ? HOME : makePrivateDir(parent, 'The Stupid Browser data');
  if (to === from) throw new Error('Your data is already there');
  writePointer(Object.assign(readPointer(), { pending: { from, to }, error: null, movedTo: null }));
  app.relaunch(); app.exit(0);
}

// Start after "Move…": copy with a small progress window, then restart in the new place.
async function runPendingMove() {
  const { from, to } = state.pending;
  const win = new BrowserWindow({ width: 420, height: 190, frame: false, resizable: false, show: true, backgroundColor: '#FAF6F0', webPreferences: { sandbox: true, contextIsolation: true } });
  const page = `<!doctype html><meta charset="utf-8"><body style="margin:0;font:14px Segoe UI,system-ui,sans-serif;background:#FAF6F0;color:#29251E;display:grid;place-items:center;height:100vh;-webkit-app-region:drag">
<div style="text-align:center;width:320px"><div style="font-size:18px;font-weight:600">Moving your data</div><div id="s" style="color:#8A8276;margin:6px 0 16px;font-size:13px">To ${to.replace(/[<&>"]/g, '')}</div>
<div style="height:5px;border-radius:3px;background:#E8E0D4;overflow:hidden"><i id="b" style="display:block;height:100%;width:0;background:#D97757;transition:width .2s"></i></div></div>`;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(page)).catch(() => {});
  const show = (pct, text) => { if (!win.isDestroyed()) win.webContents.executeJavaScript(`b.style.width='${pct}%';${text ? `s.textContent=${JSON.stringify(text)};` : ''}`).catch(() => {}); };
  try {
    if (to !== HOME && !fs.existsSync(to)) throw new Error('The new folder is gone');
    const total = Math.max(1, await sizeOf(from));
    let done = 0, files = 0, last = 0;
    await walk(from, async (p, size) => {
      if (inside(p, to)) return;
      const dest = path.join(to, path.relative(from, p));
      await fs.promises.mkdir(path.dirname(dest), { recursive: true });
      await fs.promises.copyFile(p, dest);
      done += size; files++;
      const pct = Math.round(done / total * 100); if (pct !== last) { last = pct; show(pct); }
    });
    // The copy is checked before anything else changes.
    let copied = 0; await walk(to, () => { copied++; });
    if (copied < files) throw new Error('The copy is incomplete');
    fs.writeFileSync(path.join(to, '.stupid-data'), '');
    show(100, 'Done. Starting…');
    writePointer({ dir: to, cleanup: from === HOME ? HOME : from, movedTo: to });
  } catch (e) {
    // Nothing is lost: it keeps using the old place, and the half-made copy goes.
    if (to !== HOME) { try { fs.rmSync(to, { recursive: true, force: true }); } catch {} }
    writePointer(Object.assign(readPointer(), { pending: null, error: `Moving your data didn’t work (${e.message}). Everything is still where it was.` }));
  }
  await new Promise((r) => setTimeout(r, 700));
  app.relaunch(); app.exit(0);
}

// After a move: the old copy is cleared (in the usual folder only this note stays).
async function clearOld() {
  const old = state.cleanup; if (!old || inside(state.dir, old) && old !== HOME) return;
  try {
    const keep = old === HOME ? new Set(['data-location.json']) : null;
    for (const e of await fs.promises.readdir(old)) { if (keep && keep.has(e)) continue; if (old === HOME && path.join(old, e) === state.dir) continue; await fs.promises.rm(path.join(old, e), { recursive: true, force: true, maxRetries: 3 }); }
    if (old !== HOME) await fs.promises.rm(old, { recursive: true, force: true, maxRetries: 3 });
  } catch (e) { console.error('old data cleanup', e.message); return; }
  const p = readPointer(); delete p.cleanup; writePointer(p);
}
function takeNotice() { const p = readPointer(); const n = { movedTo: p.movedTo || null, error: p.error || null }; if (n.movedTo || n.error) { delete p.movedTo; delete p.error; writePointer(p); } return n; }

module.exports = { state, requestMove, runPendingMove, clearOld, takeNotice, sizeOf, freeOn, HOME };
