'use strict';
// Profiles, Chrome-style: every profile has its own data folder (cookies, history, passwords, settings…)
// and runs as its own browser process. "default" uses the original folder, so existing data stays put.
// The list of profiles lives in the base folder (profiles.json), shared by all of them.
const { app, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const BASE = app.getPath('userData');
const ARG = process.argv.find((a) => a.startsWith('--profile='));
const CURRENT = ARG && /^[a-z0-9]{1,24}$/.test(ARG.slice(10)) ? ARG.slice(10) : 'default';
if (CURRENT !== 'default') app.setPath('userData', path.join(BASE, 'Profiles', CURRENT));   // must run before anything touches userData

const listFile = path.join(BASE, 'profiles.json');
function list() {
  let l = [];
  try { l = JSON.parse(fs.readFileSync(listFile, 'utf8')); } catch {}
  if (!Array.isArray(l)) l = [];
  if (!l.some((p) => p.id === 'default')) l.unshift({ id: 'default', name: 'Default', color: 'clay' });
  return l.filter((p) => p && /^[a-z0-9]{1,24}$/.test(p.id));
}
function save(l) {
  try { fs.mkdirSync(BASE, { recursive: true }); fs.writeFileSync(listFile + '.tmp', JSON.stringify(l)); fs.renameSync(listFile + '.tmp', listFile); } catch (e) { console.error('profiles write failed', e); }
}
// Keep this profile's name/color/email in the shared list current.
function sync(s) {
  const l = list(); const me = l.find((p) => p.id === CURRENT);
  const next = { id: CURRENT, name: (s.name || '').trim() || (me && me.name) || 'Profile', color: s.profileColor || 'clay', email: s.email || '' };
  if (me && me.name === next.name && me.color === next.color && (me.email || '') === next.email) return;
  if (me) Object.assign(me, next); else l.push(next);
  save(l);
}
// Start (or focus, via the single-instance lock) another profile's browser.
function open(id) {
  if (!list().some((p) => p.id === id)) return false;
  const udd = process.argv.find((a) => a.startsWith('--user-data-dir='));   // keep a custom data folder (dev/tests)
  const args = [...(app.isPackaged ? [] : [app.getAppPath()]), ...(udd ? [udd] : []), `--profile=${id}`];
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('STUPID_SELFTEST')));   // self-tests stay in this process
  spawn(process.execPath, args, { detached: true, stdio: 'ignore', env }).unref();
  return true;
}
function create({ name, color } = {}) {
  const l = list();
  if (l.length >= 20) return null;
  const id = 'p' + Date.now().toString(36);
  const p = { id, name: String(name || '').trim().slice(0, 40) || `Profile ${l.length + 1}`, color: String(color || 'sky').slice(0, 20) };
  l.push(p); save(l);
  // Seed its settings so the new browser greets the person by name.
  const dir = path.join(BASE, 'Profiles', id);
  try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ name: p.name, profileColor: p.color })); } catch {}
  return p;
}
// Removing moves the profile's folder to the Trash (recoverable), never the current or default one.
async function remove(id) {
  if (id === 'default' || id === CURRENT) return false;
  const l = list(); const i = l.findIndex((p) => p.id === id); if (i < 0) return false;
  l.splice(i, 1); save(l);
  const dir = path.join(BASE, 'Profiles', id);
  if (fs.existsSync(dir)) { try { await shell.trashItem(dir); } catch (e) { console.error('profile trash failed', e); } }
  return true;
}

// "Who's browsing?" picker at launch (shared preference, stored next to profiles.json)
const prefFile = path.join(BASE, 'profiles-prefs.json');
function pickerEnabled() { try { return JSON.parse(fs.readFileSync(prefFile, 'utf8')).picker !== false; } catch { return true; } }
function setPicker(on) { try { fs.writeFileSync(prefFile, JSON.stringify({ picker: !!on })); } catch {} return !!on; }

module.exports = { CURRENT, list, sync, open, create, remove, pickerEnabled, setPicker };
