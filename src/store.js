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
function writeNow(name) {
  clearTimeout(timers.get(name)); timers.delete(name);
  if (!cache.has(name)) return;
  try {
    fs.mkdirSync(dir(), { recursive: true });
    const tmp = file(name) + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(cache.get(name)));
    fs.renameSync(tmp, file(name));
  } catch (e) { console.error('store write failed', name, e); }
}
function write(name, value, delay = 400) {
  cache.set(name, value);
  clearTimeout(timers.get(name));
  timers.set(name, setTimeout(() => writeNow(name), delay));
  return value;
}
function flushAll() { for (const name of [...timers.keys()]) writeNow(name); }

module.exports = { read, write, writeNow, flushAll };
