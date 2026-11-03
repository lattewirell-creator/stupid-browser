'use strict';
// Sync between computers without an account. You pick a folder your cloud drive already syncs (OneDrive, Dropbox,
// iCloud Drive, Google Drive) and a passphrase. Bookmarks, passwords and payment cards go into one file there,
// encrypted with AES-256-GCM under a key made from the passphrase (scrypt). The drive only ever sees the encrypted file.
//
// Merging is three-way: each computer remembers what everything looked like at its last sync (as hashes). An item
// that changed only here wins, one that changed only in the file wins, and if both changed, this computer wins.
// So a delete on one computer reaches the others, and nothing needs a server.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = 'Stupid Browser Sync.sbsync';
const MAGIC = 'stupid-browser-sync';
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
// Keyed with the passphrase, so the hashes kept on disk say nothing about a password or card number to anyone without it
// (and are the same on every computer that uses the same passphrase).
let secret = '';
const hash = (v) => (v === undefined ? undefined : crypto.createHmac('sha256', secret).update(JSON.stringify(v)).digest('base64').slice(0, 22));

module.exports = function createSync({ store, enc, dec, broadcast }) {
  const state = () => store.read('sync-state.json', {});
  const saveState = (s) => store.write('sync-state.json', s);
  const keys = new Map();   // salt → derived key, so the slow scrypt runs once per run
  const keyFor = (pass, salt) => {
    const id = salt.toString('base64') + '|' + crypto.createHash('sha256').update(pass).digest('base64');
    if (!keys.has(id)) keys.set(id, crypto.scryptSync(pass, salt, 32, SCRYPT));
    return keys.get(id);
  };
  const fileIn = (dir) => path.join(dir, FILE);

  function readRemote(dir, pass) {
    let raw; try { raw = JSON.parse(fs.readFileSync(fileIn(dir), 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw new Error('The sync file can’t be read'); }
    if (!raw || raw.app !== MAGIC || raw.v !== 1) throw new Error('The sync file is from a newer version or isn’t a sync file');
    const salt = Buffer.from(raw.salt, 'base64');
    try {
      const d = crypto.createDecipheriv('aes-256-gcm', keyFor(pass, salt), Buffer.from(raw.iv, 'base64'));
      d.setAuthTag(Buffer.from(raw.tag, 'base64'));
      const json = Buffer.concat([d.update(Buffer.from(raw.data, 'base64')), d.final()]).toString('utf8');
      return { salt, data: JSON.parse(json) };
    } catch { const e = new Error('Wrong passphrase for this sync file'); e.code = 'PASS'; throw e; }
  }
  function writeRemote(dir, pass, salt, data) {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', keyFor(pass, salt), iv);
    const body = Buffer.concat([c.update(JSON.stringify(data), 'utf8'), c.final()]);
    const out = { app: MAGIC, v: 1, salt: salt.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: body.toString('base64'), at: Date.now() };
    const tmp = fileIn(dir) + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(out)); fs.renameSync(tmp, fileIn(dir));
    try { return fs.statSync(fileIn(dir)).mtimeMs; } catch { return 0; }
  }

  // Each kind as plain values keyed by something stable across computers (ids differ between computers for passwords).
  const kinds = {
    bookmarks: {
      local: () => { const m = new Map(); for (const b of store.read('bookmarks.json', [])) if (b && b.id) m.set(b.id, b); return m; },
      apply: (merged, localMap) => {
        const order = [...localMap.keys()].filter((k) => merged.has(k));
        for (const k of merged.keys()) if (!localMap.has(k)) order.push(k);
        const list = order.map((k) => merged.get(k));
        // a bookmark whose folder is gone goes to the top level instead of disappearing
        const ids = new Set(list.map((b) => b.id));
        for (const b of list) if (b.parentId && !ids.has(b.parentId)) b.parentId = null;
        store.write('bookmarks.json', list); broadcast('bookmarks:changed', list);
      },
    },
    passwords: {
      local: () => {
        const m = new Map();
        for (const p of store.read('passwords.json', [])) {
          if (p.never) m.set(p.origin + '\u0000never', { origin: p.origin, never: true });
          else m.set(p.origin + '\u0000' + (p.username || ''), { origin: p.origin, username: p.username || '', password: dec(p.password), created: p.created || 0 });
        }
        return m;
      },
      apply: (merged) => {
        const old = store.read('passwords.json', []);
        const list = [];
        for (const [k, v] of merged) {
          const was = old.find((p) => (p.never ? p.origin + '\u0000never' : p.origin + '\u0000' + (p.username || '')) === k);
          if (v.never) list.push(was || { id: 'n' + Date.now().toString(36) + list.length, origin: v.origin, never: true });
          else if (was && dec(was.password) === v.password) list.push(was);
          else list.push({ id: (was && was.id) || 'p' + Date.now().toString(36) + list.length, origin: v.origin, username: v.username, password: enc(v.password), created: v.created || Date.now(), updated: Date.now() });
        }
        store.write('passwords.json', list); broadcast('passwords:changed', true);
      },
    },
    cards: {
      local: () => { const m = new Map(); for (const c of store.read('cards.json', [])) { const n = dec(c.number); if (n) m.set(hash(n), { number: n, month: c.month || 0, year: c.year || 0, name: c.name || '' }); } return m; },
      apply: (merged) => {
        const old = store.read('cards.json', []);
        const list = [];
        for (const [k, v] of merged) {
          const was = old.find((c) => hash(dec(c.number)) === k);
          if (was && was.month === v.month && was.year === v.year && (was.name || '') === v.name) list.push(was);
          else list.push({ id: (was && was.id) || 'c' + Date.now().toString(36) + list.length, number: enc(v.number), month: v.month, year: v.year, name: v.name, created: (was && was.created) || Date.now(), updated: Date.now() });
        }
        store.write('cards.json', list); broadcast('cards:changed', true);
      },
    },
  };

  function merge(localMap, remoteObj, base) {
    const out = new Map(); let localChanged = false, remoteChanged = false;
    const all = new Set([...localMap.keys(), ...Object.keys(remoteObj), ...Object.keys(base)]);
    for (const k of all) {
      const l = localMap.get(k), r = remoteObj[k], b = base[k];
      const hl = hash(l), hr = hash(r);
      const pick = hl !== b ? (l !== undefined || hr === b ? l : r) : r;   // changed here wins, unless deleted here while edited there
      if (pick !== undefined) out.set(k, pick);
      if (hash(pick) !== hl) localChanged = true;
      if (hash(pick) !== hr) remoteChanged = true;
    }
    return { out, localChanged, remoteChanged };
  }

  let running = null, timer = null, poll = null, lastMtime = 0, muted = false;
  const status = () => { const s = state(); return { on: !!(s.dir && s.pass), dir: s.dir || '', last: s.last || 0, error: s.error || '', counts: s.counts || null }; };

  async function syncNow() {
    if (running) return running;
    running = (async () => {
      const s = state();
      if (!s.dir || !s.pass) return status();
      const pass = dec(s.pass); secret = pass;
      try {
        if (!fs.existsSync(s.dir)) throw new Error('The sync folder isn’t there right now');
        const remote = readRemote(s.dir, pass);
        const salt = remote ? remote.salt : crypto.randomBytes(16);
        const rdata = (remote && remote.data) || {};
        const base = s.base || {};
        const next = {}, nextBase = {}, counts = {};
        let anyRemote = !remote;
        muted = true;
        for (const [name, k] of Object.entries(kinds)) {
          const localMap = k.local();
          const { out, localChanged, remoteChanged } = merge(localMap, rdata[name] || {}, base[name] || {});
          if (localChanged) k.apply(out, localMap);
          if (remoteChanged) anyRemote = true;
          next[name] = Object.fromEntries(out);
          nextBase[name] = Object.fromEntries([...out].map(([key, v]) => [key, hash(v)]));
          counts[name] = out.size;
        }
        muted = false;
        if (anyRemote) lastMtime = writeRemote(s.dir, pass, salt, next);
        else try { lastMtime = fs.statSync(fileIn(s.dir)).mtimeMs; } catch {}
        saveState({ ...state(), base: nextBase, last: Date.now(), error: '', counts });
      } catch (e) {
        muted = false;
        saveState({ ...state(), error: e.message || 'Sync failed' });
      }
      broadcast('sync:changed', status());
      return status();
    })().finally(() => { running = null; });
    return running;
  }

  // A change here syncs a few seconds later; a change from another computer is noticed within a minute (one stat()).
  const soon = () => { clearTimeout(timer); timer = setTimeout(syncNow, 4000); };
  function watchStore() {
    const write = store.write;
    store.write = function (name, v) { const r = write.apply(this, arguments); if (!muted && /^(bookmarks|passwords|cards)\.json$/.test(name) && status().on) soon(); return r; };
  }
  function startPolling() {
    clearInterval(poll);
    if (!status().on) return;
    poll = setInterval(() => {
      const s = state(); if (!s.dir) return;
      fs.stat(fileIn(s.dir), (err, st) => { if (!err && st.mtimeMs !== lastMtime) syncNow(); });
    }, 60 * 1000);
    poll.unref && poll.unref();
  }

  return {
    status,
    syncNow,
    // Check the passphrase against an existing file before turning sync on, so a typo can't fork the data.
    async enable(dir, pass) {
      if (!dir || !fs.existsSync(dir)) return { error: 'Pick a folder first' };
      if (!pass || pass.length < 8) return { error: 'Use a passphrase of at least 8 characters' };
      try { readRemote(dir, pass); } catch (e) { return { error: e.message }; }
      saveState({ dir, pass: enc(pass), base: {}, last: 0, error: '' });
      const r = await syncNow(); startPolling(); return r;
    },
    disable() { clearInterval(poll); clearTimeout(timer); saveState({}); broadcast('sync:changed', status()); return status(); },
    start() { watchStore(); if (status().on) { setTimeout(syncNow, 5000); startPolling(); } },
    _merge: merge,
  };
};
