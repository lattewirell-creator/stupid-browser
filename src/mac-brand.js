'use strict';
// macOS: make Settings → Browser name / app icon permanent by writing them into the app bundle
// (Finder, the Dock and ⌘Tab then show them even when the browser isn't running).
// The bundle is edited by a small shell script after the browser quits, then the app reopens.
// Builds without a Developer ID only carry a linker signature on the executable, so editing
// Info.plist and Resources/ doesn't invalidate anything.
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');

const DEFAULT_NAME = 'The Stupid Browser';
const run = (cmd, args) => new Promise((resolve, reject) => execFile(cmd, args, { timeout: 60000 }, (err, out) => (err ? reject(err) : resolve(String(out).trim()))));
const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const appPath = () => path.resolve(process.execPath, '..', '..', '..');
const cleanName = (n) => String(n || '').replace(/[/:\\\0]/g, ' ').replace(/^[.\s]+/, '').replace(/\s+/g, ' ').trim().slice(0, 40) || DEFAULT_NAME;

function supported() {
  const p = appPath();
  if (process.platform !== 'darwin' || !app.isPackaged || !p.endsWith('.app') || /AppTranslocation|^\/Volumes\//.test(p)) return false;
  try { fs.accessSync(path.dirname(p), fs.constants.W_OK); fs.accessSync(p, fs.constants.W_OK); return true; } catch { return false; }
}

// Current state of the bundle (what Finder shows now).
async function status() {
  if (!supported()) return { supported: false };
  const p = appPath();
  let name = DEFAULT_NAME;
  try { name = await run('/usr/bin/plutil', ['-extract', 'CFBundleDisplayName', 'raw', '-o', '-', path.join(p, 'Contents', 'Info.plist')]); } catch {}
  return { supported: true, name, custom: fs.existsSync(path.join(p, 'Contents', 'Resources', 'icon-default.icns')) || name !== DEFAULT_NAME, path: p };
}

// PNG data URL → .icns (all the sizes macOS wants) in a temp folder.
async function makeIcns(dataUrl) {
  const img = nativeImage.createFromDataURL(dataUrl);
  if (img.isEmpty()) throw new Error('That logo image couldn’t be read');
  const work = fs.mkdtempSync(path.join(app.getPath('temp'), 'stupid-icon-'));
  const set = path.join(work, 'icon.iconset'); fs.mkdirSync(set);
  for (const s of [16, 32, 128, 256, 512]) {
    fs.writeFileSync(path.join(set, `icon_${s}x${s}.png`), img.resize({ width: s, height: s, quality: 'best' }).toPNG());
    fs.writeFileSync(path.join(set, `icon_${s}x${s}@2x.png`), img.resize({ width: s * 2, height: s * 2, quality: 'best' }).toPNG());
  }
  const out = path.join(work, 'icon.icns');
  await run('/usr/bin/iconutil', ['-c', 'icns', set, '-o', out]);
  return out;
}

// Shell lines that brand the bundle at `target` (also used after an update swaps the bundle in).
// opts: { name, icns } — icns null restores the original icon; the final .app path is echoed back.
function scriptLines(target, { name, icns }) {
  const plist = `${target}/Contents/Info.plist`, res = `${target}/Contents/Resources`;
  const finalPath = path.join(path.dirname(target), cleanName(name) + '.app');
  return {
    finalPath,
    lines: [
      // (CFBundleName stays: Electron finds its helper apps by it.)
      `/usr/bin/plutil -replace CFBundleDisplayName -string ${q(cleanName(name))} ${q(plist)}`,
      `[ -f ${q(res + '/icon-default.icns')} ] || cp ${q(res + '/icon.icns')} ${q(res + '/icon-default.icns')}`,
      icns ? `cp ${q(icns)} ${q(res + '/icon.icns')}` : `cp ${q(res + '/icon-default.icns')} ${q(res + '/icon.icns')}`,
      // Rename the .app folder too (that's what Finder and the Dock label), unless something already has that name.
      finalPath !== target ? `if [ ! -e ${q(finalPath)} ]; then mv ${q(target)} ${q(finalPath)}; fi` : ':',
      `T=${q(finalPath)}; [ -d "$T" ] || T=${q(target)}`,
      `touch "$T"`,
      `/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$T" >/dev/null 2>&1`,
      `killall Dock 2>/dev/null; :`
    ]
  };
}

// Brand the running app: waits for this process to exit, edits the bundle, reopens it.
async function apply({ name, iconDataUrl }) {
  if (!supported()) throw new Error('Move The Stupid Browser into Applications first');
  let icns = null;
  const keep = path.join(app.getPath('userData'), 'brand-icon.icns');
  if (iconDataUrl) { const made = await makeIcns(iconDataUrl); fs.copyFileSync(made, keep); fs.rmSync(path.dirname(made), { recursive: true, force: true }); icns = keep; }
  else fs.rmSync(keep, { force: true });
  const target = appPath();
  const { lines } = scriptLines(target, { name, icns });
  const udd = process.argv.find((x) => x.startsWith('--user-data-dir='));
  const script = [
    `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.3; done`,
    ...lines,
    `open "$T"${udd ? ' --args ' + q(udd) : ''}`
  ].join('\n');
  spawn('/bin/sh', ['-c', script], { detached: true, stdio: 'ignore' }).unref();
  return true;
}

// For the updater: lines that re-brand a freshly swapped-in bundle, or null if the app isn't branded.
function relabelAfterUpdate(target, settings) {
  if (!settings.brandBundle) return null;
  const keep = path.join(app.getPath('userData'), 'brand-icon.icns');
  return scriptLines(target, { name: settings.wordmark || DEFAULT_NAME, icns: fs.existsSync(keep) ? keep : null }).lines;
}

module.exports = { relabelAfterUpdate, supported, status, apply, makeIcns, scriptLines, cleanName, DEFAULT_NAME };
