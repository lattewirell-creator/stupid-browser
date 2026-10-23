'use strict';
// Tiny JSON store in userData with atomic, debounced writes.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const cache = new Map();
const timers = new Map();
const dir = () => app.getPath('userData');
const file = (name) => path.join(dir(), name);

function read(name, fallback) {
  if (cache.has(name)) return cache.get(name);
  let v;
  try { v = JSON.parse(fs.readFileSync(file(name), 'utf8')); } catch { v = typeof fallback === 'function' ? fallback() : fallback; }
  cache.set(name, v);
  return v;
}
// Writes happen off the main thread's critical path: a big file (history, Rewind) written with writeFileSync froze
// input and every window for tens of milliseconds each time. One write per file at a time; a change that arrives
// while one is running is written right after it.
const writing = new Map();   // name → Promise of the write in progress
const gen = new Map();       // name → bumped by each synchronous write, so an older async write finishing later can't replace it
function writeNow(name) {   // synchronous: for quitting, when there's no later to wait for
  clearTimeout(timers.get(name)); timers.delete(name);
  if (!cache.has(name)) return;
  gen.set(name, (gen.get(name) || 0) + 1);
  try {
    fs.mkdirSync(dir(), { recursive: true });
    const tmp = file(name) + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(cache.get(name)));
    fs.renameSync(tmp, file(name));
  } catch (e) { console.error('store write failed', name, e); }
}
function writeLater(name) {
  timers.delete(name);
  if (writing.has(name)) { timers.set(name, setTimeout(() => writeLater(name), 100)); return; }
  if (!cache.has(name)) return;
  const tmp = file(name) + '.' + process.pid + '.tmp', g = gen.get(name);
  const job = fs.promises.mkdir(dir(), { recursive: true })
    .then(() => fs.promises.writeFile(tmp, JSON.stringify(cache.get(name))))
    .then(() => (gen.get(name) !== g ? fs.promises.rm(tmp, { force: true }) : fs.promises.rename(tmp, file(name))))
    .catch((e) => console.error('store write failed', name, e))
    .finally(() => writing.delete(name));
  writing.set(name, job);
}
function write(name, value, delay = 400) {
  cache.set(name, value);
  clearTimeout(timers.get(name));
  timers.set(name, setTimeout(() => writeLater(name), delay));
  return value;
}
function flushAll() { for (const name of new Set([...timers.keys(), ...writing.keys()])) writeNow(name); }

module.exports = { read, write, writeNow, flushAll };
