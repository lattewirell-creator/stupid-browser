'use strict';
// Sync between computers without an account. You pick a folder your cloud drive already syncs (OneDrive, Dropbox,
// iCloud Drive, Google Drive) and a passphrase. Bookmarks, passwords and payment cards go into one file there,
// encrypted with AES-256-GCM under a key made from the passphrase (scrypt). The drive only ever sees the encrypted file.
//
// Every item carries the time it last changed, and a delete is written down as a dated "deleted" mark. When two
// copies disagree, the newer one wins. Something that is simply missing from the file is never taken as deleted: a
// file that vanished, was offloaded by iCloud, or lost a race with another computer can't wipe anything.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = 'Stupid Browser Sync.sbsync';
const MAGIC = 'stupid-browser-sync';
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const TOMB_DAYS = 180;   // a delete mark is kept this long, so a computer that was away for months still hears of it
// Keyed with the passphrase, so the hashes kept on disk say nothing about a password or card number to anyone without it
// (and are the same on every computer that uses the same passphrase).
let secret = '';
const hash = (v) => (v === undefined ? undefined : crypto.createHmac('sha256', secret).update(JSON.stringify(v)).digest('base64').slice(0, 22));

module.exports = function createSync({ store, enc, dec, broadcast }) {
  const state = () => store.read('sync-state.json', {});
  const saveState = (s) => store.write('sync-state.json', s);
  const keys = new Map();   // salt+passphrase → derived key, so the slow scrypt runs once per run
  const keyFor = (pass, salt) => {
    const id = salt.toString('base64') + '|' + crypto.createHash('sha256').update(pass).digest('base64');
    if (!keys.has(id)) keys.set(id, crypto.scryptSync(pass, salt, 32, SCRYPT));
    return keys.get(id);
  };
  const fileIn = (dir) => path.join(dir, FILE);
  // Cloud drives keep a losing write as a copy ("… (conflicted copy …)", "… 2.sbsync", "…-DESKTOP-1.sbsync"). Those are
  // read and merged too, then removed, so nothing written on another computer is lost to a race.
  const copiesIn = (dir) => { try { return fs.readdirSync(dir).filter((f) => f !== FILE && /^Stupid Browser Sync.*\.sbsync$/i.test(f)).map((f) => path.join(dir, f)); } catch { return []; } };

  function readFile(file, pass) {
    let raw; try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw new Error('The sync file can’t be read right now'); }
    if (!raw || raw.app !== MAGIC) throw new Error('The sync file isn’t one The Stupid Browser can read');
    if (raw.v !== 2) throw new Error('The sync file was made by a newer version. Update The Stupid Browser on this computer.');
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
    const out = { app: MAGIC, v: 2, salt: salt.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: body.toString('base64'), at: Date.now() };
    const tmp = fileIn(dir) + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(out)); fs.renameSync(tmp, fileIn(dir));
    try { return fs.statSync(fileIn(dir)).mtimeMs; } catch { return 0; }
  }

  // A secret this computer can't decrypt (keychain locked or denied) must stop the sync: read as empty, it would look
  // like a change or a delete and spread to every computer.
  const mustDec = (s) => { const v = dec(s || ''); if (!v) { const e = new Error('Can’t unlock this computer’s saved passwords right now (system keychain). Sync paused.'); e.code = 'DEC'; throw e; } return v; };
  const pickNewer = (a, b) => ((b.updated || b.created || 0) > (a.updated || a.created || 0) ? b : a);

  // Each kind: local() → Map key → { v: plain value, t: when it last changed (0 if unknown) }; apply() writes values back.
  // Keys are the same on every computer (ids aren't, for passwords and cards).
  const kinds = {
    bookmarks: {
      local: () => { const m = new Map(); for (const b of store.read('bookmarks.json', [])) if (b && b.id) { const { ts, ...v } = b; m.set(b.id, { v, t: ts || 0 }); } return m; },
      apply: (merged) => {
        const old = store.read('bookmarks.json', []);
        const order = old.map((b) => b.id).filter((k) => merged.has(k));
        for (const k of merged.keys()) if (!order.includes(k)) order.push(k);
        const list = order.map((k) => ({ ...merged.get(k).v, ts: merged.get(k).t }));
        // a bookmark whose folder is gone goes to the top level instead of disappearing
        const ids = new Set(list.map((b) => b.id));
        for (const b of list) if (b.parentId && !ids.has(b.parentId)) b.parentId = null;
        store.write('bookmarks.json', list); broadcast('bookmarks:changed', list);
      },
    },
    passwords: {
      local: () => {
        const m = new Map(), by = new Map();
        for (const p of store.read('passwords.json', [])) { const k = p.origin + '\u0000' + (p.never ? '\u0001never' : p.username || ''); by.set(k, by.has(k) ? pickNewer(by.get(k), p) : p); }
        for (const [k, p] of by) m.set(k, { v: p.never ? { origin: p.origin, never: true } : { origin: p.origin, username: p.username || '', password: mustDec(p.password) }, t: p.updated || p.created || 0 });
        return m;
      },
      apply: (merged) => {
        const old = store.read('passwords.json', []);
        const list = [];
        for (const [k, { v, t }] of merged) {
          const was = old.find((p) => p.origin + '\u0000' + (p.never ? '\u0001never' : p.username || '') === k);
          if (v.never) list.push(was && was.never ? { ...was, updated: t } : { id: 'n' + Date.now().toString(36) + list.length, origin: v.origin, never: true, created: t, updated: t });
          else if (was && !was.never && dec(was.password) === v.password) list.push({ ...was, updated: t });
          else list.push({ id: (was && was.id) || 'p' + Date.now().toString(36) + list.length, origin: v.origin, username: v.username, password: enc(v.password), created: (was && was.created) || t, updated: t });
        }
        store.write('passwords.json', list); broadcast('passwords:changed', true);
      },
    },
    cards: {
      local: () => {
        const m = new Map();
        for (const c of store.read('cards.json', [])) { const n = mustDec(c.number), k = hash(n), e = m.get(k), t = c.updated || c.created || 0; if (!e || t > e.t) m.set(k, { v: { number: n, month: c.month || 0, year: c.year || 0, name: c.name || '' }, t }); }
        return m;
      },
      apply: (merged) => {
        const old = store.read('cards.json', []);
        const list = [];
        for (const [k, { v, t }] of merged) {
          const was = old.find((c) => hash(dec(c.number)) === k);
          if (was && was.month === v.month && was.year === v.year && (was.name || '') === v.name) list.push({ ...was, updated: t });
          else list.push({ id: (was && was.id) || 'c' + Date.now().toString(36) + list.length, number: enc(v.number), month: v.month, year: v.year, name: v.name, created: (was && was.created) || t, updated: t });
        }
        store.write('cards.json', list); broadcast('cards:changed', true);
      },
    },
  };

  // One kind. local: Map from local(); remotes: [{ items, deleted }] from the file(s); base: { key: hash } as of this
  // computer's last sync, used only to notice what changed or was deleted here since then (that gets the time now).
  function merge(local, remotes, base, now) {
    const items = new Map(), deleted = new Map();
    const offer = (k, e) => { const cur = items.get(k); if (!cur || e.t > cur.t || (e.t === cur.t && hash(e.v) > hash(cur.v))) items.set(k, e); };
    const tomb = (k, t) => { if (t > (deleted.get(k) || 0)) deleted.set(k, t); };
    for (const [k, e] of local) offer(k, base[k] !== undefined && hash(e.v) !== base[k] ? { v: e.v, t: Math.max(e.t, now) } : e);
    for (const k of Object.keys(base)) if (!local.has(k)) tomb(k, now);   // was here at the last sync, gone now: deleted here
    for (const r of remotes) {
      for (const [k, e] of Object.entries(r.items || {})) if (e && 'v' in e) offer(k, { v: e.v, t: +e.t || 0 });
      for (const [k, t] of Object.entries(r.deleted || {})) tomb(k, +t || 0);
    }
    for (const [k, t] of deleted) { const e = items.get(k); if (e && e.t <= t) items.delete(k); else if (e) deleted.delete(k); }
    for (const [k, t] of deleted) if (now - t > TOMB_DAYS * 864e5) deleted.delete(k);
    return { items, deleted };
  }

  let running = null, timer = null, poll = null, lastMtime = 0, muted = false;
  const status = () => { const s = state(); return { on: !!(s.dir && s.pass), dir: s.dir || '', last: s.last || 0, error: s.error || '', counts: s.counts || null }; };

  async function syncNow() {
    if (running) return running;
    running = (async () => {
      const s = state();
      if (!s.dir || !s.pass) return status();
      try {
        const pass = dec(s.pass);
        if (!pass) throw new Error('Can’t unlock the sync passphrase on this computer (system keychain). Turn sync off and on again.');
        secret = pass;
        if (!fs.existsSync(s.dir)) throw new Error('The sync folder isn’t there right now');
        const main = readFile(fileIn(s.dir), pass);
        const copies = [];
        for (const f of copiesIn(s.dir)) { try { const r = readFile(f, pass); if (r) copies.push({ file: f, data: r.data }); } catch { /* another passphrase or a broken copy: leave it alone */ } }
        const salt = main ? main.salt : crypto.randomBytes(16);
        const sources = [main && main.data, ...copies.map((c) => c.data)].filter(Boolean);
        const base = s.base || {}, now = Date.now();
        const next = {}, nextBase = {}, counts = {};
        const locals = {};
        for (const [name, k] of Object.entries(kinds)) locals[name] = k.local();   // all of them first: a keychain error stops before anything is written
        let changedRemote = !main || copies.length > 0;
        muted = true;
        try {
          for (const [name, k] of Object.entries(kinds)) {
            const local = locals[name];
            const { items, deleted } = merge(local, sources.map((d) => d[name] || {}), base[name] || {}, now);
            const sameAsLocal = items.size === local.size && [...items].every(([key, e]) => local.has(key) && hash(local.get(key).v) === hash(e.v) && local.get(key).t === e.t);
            if (!sameAsLocal) k.apply(items);
            const out = { items: Object.fromEntries(items), deleted: Object.fromEntries(deleted) };
            const before = main && main.data[name];
            const sig = (o) => JSON.stringify([Object.entries(o.items || {}).map(([key, e]) => [key, hash(e.v), +e.t]).sort(), Object.entries(o.deleted || {}).sort()]);
            if (!before || sig(before) !== sig(out)) changedRemote = true;
            next[name] = out;
            nextBase[name] = Object.fromEntries([...items].map(([key, e]) => [key, hash(e.v)]));
            counts[name] = items.size;
          }
        } finally { muted = false; }
        if (changedRemote) lastMtime = writeRemote(s.dir, pass, salt, next);
        else try { lastMtime = fs.statSync(fileIn(s.dir)).mtimeMs; } catch {}
        for (const c of copies) try { fs.unlinkSync(c.file); } catch {}
        saveState({ ...state(), base: nextBase, last: Date.now(), error: '', counts });
      } catch (e) {
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
    store.write = function (name) { const r = write.apply(this, arguments); if (!muted && /^(bookmarks|passwords|cards)\.json$/.test(name) && status().on) soon(); return r; };
  }
  function startPolling() {
    clearInterval(poll);
    if (!status().on) return;
    poll = setInterval(() => {
      const s = state(); if (!s.dir) return;
      fs.stat(fileIn(s.dir), (err, st) => { if ((!err && st.mtimeMs !== lastMtime) || copiesIn(s.dir).length) syncNow(); });
    }, 60 * 1000);
    if (poll.unref) poll.unref();
  }

  return {
    status,
    syncNow,
    // Check the passphrase against an existing file before turning sync on, so a typo can't fork the data. The first
    // sync has no record of earlier syncs, so it only adds and updates (by date); it never deletes anything here.
    async enable(dir, pass) {
      if (!dir || !fs.existsSync(dir)) return { error: 'Pick a folder first' };
      if (!pass || pass.length < 8) return { error: 'Use a passphrase of at least 8 characters' };
      try { readFile(fileIn(dir), pass); } catch (e) { return { error: e.message }; }
      saveState({ dir, pass: enc(pass), base: {}, last: 0, error: '' });
      const r = await syncNow(); startPolling(); return r;
    },
    disable() { clearInterval(poll); clearTimeout(timer); saveState({}); broadcast('sync:changed', status()); return status(); },
    start() { watchStore(); if (status().on) { setTimeout(syncNow, 5000); startPolling(); } },
  };
};
