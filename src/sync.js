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
  const badCopies = new Set();   // "path|mtime" of copies that can't be read (other passphrase, broken): not retried until they change
  const copyId = (f) => { try { return f + '|' + fs.statSync(f).mtimeMs; } catch { return f; } };
  const copiesIn = (dir) => { try { return fs.readdirSync(dir).filter((f) => f !== FILE && /^Stupid Browser Sync.*\.sbsync$/i.test(f)).map((f) => path.join(dir, f)).filter((f) => !badCopies.has(copyId(f))); } catch { return []; } };

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

  // One kind. local: Map from local(); remotes: [{ items, deleted }] from the file(s); base: { key: [hash, clock] } as of
  // this computer's last sync. Every item and delete mark carries a version clock: { computer id: how many changes that
  // computer has made to it }. An edit whose clock covers another's was made after seeing it, so it wins whatever the
  // wall clocks say. Two edits made without seeing each other (offline, say) are compared by time: the newer one wins.
  // The result carries both clocks merged, so the next edit anywhere counts as having seen both.
  function merge(local, remotes, base, now, touched, me) {
    const T = (c) => Math.min(c.t, now);   // compared as at most now (a clock running ahead can't win forever); stored as is
    const covers = (a, b) => Object.entries(b).every(([id, n]) => (a[id] || 0) >= n);
    const wins = (a, b) => {
      if (!b) return true;
      const ab = covers(a.c, b.c), ba = covers(b.c, a.c);
      if (ab && !ba) return true;
      if (ba && !ab) return false;
      if (T(a) !== T(b)) return T(a) > T(b);
      if (!!a.del !== !!b.del) return !!a.del;
      return !a.del && hash(a.v) > hash(b.v);
    };
    const best = new Map(), seen = new Map();
    const offer = (k, c) => {
      const m = seen.get(k) || {}; for (const [id, n] of Object.entries(c.c)) if (n > (m[id] || 0)) m[id] = n; seen.set(k, m);
      if (wins(c, best.get(k))) best.set(k, c);
    };
    const clockOf = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
    for (const r of remotes) {
      for (const [k, e] of Object.entries(r.items || {})) if (e && 'v' in e) offer(k, { v: e.v, t: +e.t || 0, c: clockOf(e.c) });
      for (const [k, d] of Object.entries(r.deleted || {})) { const a = Array.isArray(d) ? d : [d]; offer(k, { del: true, t: +a[0] || 0, c: clockOf(a[1]) }); }
    }
    // Changed here since the last sync: dated by its own change time if that's after the last sync, else by when this
    // computer last changed that kind of data (noted as it happened), so an edit made offline doesn't look newer than it is.
    const lastSync = local.__last || 0;
    const fresh = (t) => Math.min(now, t > lastSync ? t : touched || now);
    const baseOf = (k) => { const b = base[k]; return b === undefined ? null : [Array.isArray(b) ? b[0] : b, Array.isArray(b) ? clockOf(b[1]) : {}]; };
    const tick = (c) => ({ ...c, [me]: (c[me] || 0) + 1 });
    for (const [k, e] of local) {
      const b = baseOf(k);
      if (b && hash(e.v) === b[0]) offer(k, { v: e.v, t: e.t, c: b[1] });                 // unchanged here
      else offer(k, { v: e.v, t: b ? fresh(e.t) : Math.min(now, e.t), c: tick(b ? b[1] : {}) });   // changed here, or never synced from here
    }
    for (const k of Object.keys(base)) if (!local.has(k)) offer(k, { del: true, t: Math.min(now, touched || now), c: tick(baseOf(k)[1]) });   // deleted here
    const items = new Map(), deleted = new Map();
    for (const [k, w] of best) {
      const c = seen.get(k);
      if (!w.del) items.set(k, { v: w.v, t: w.t, c });
      else deleted.set(k, [w.t, c]);   // kept for good (a few dozen bytes each), so even a computer away for a year hears of it
    }
    return { items, deleted };
  }

  let running = null, timer = null, poll = null, lastMtime = 0, muted = false;
  const status = () => { const s = state(); return { on: !!(s.dir && s.pass), dir: s.dir || '', last: s.last || 0, error: s.error || '', counts: s.counts || null, paused: s.paused || [] }; };

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
        for (const f of copiesIn(s.dir)) { try { const r = readFile(f, pass); if (r) copies.push({ file: f, data: r.data }); } catch { badCopies.add(copyId(f)); /* another passphrase or a broken copy: leave it alone */ } }
        const salt = main ? main.salt : crypto.randomBytes(16);
        const sources = [main && main.data, ...copies.map((c) => c.data)].filter(Boolean);
        const base = s.base || {}, now = Date.now();
        const next = {}, nextBase = {}, counts = {};
        const locals = {};
        const me = s.me || (s.me = crypto.randomBytes(6).toString('base64'));
        const paused = [], allow = s.allowEmpty || [];
        for (const [name, k] of Object.entries(kinds)) {   // all of them first: an error here stops before anything is written
          locals[name] = k.local(); locals[name].__last = s.last || 0;
          // everything gone at once looks more like a lost or unreadable file than a choice: that kind waits for you to
          // say which (Settings → Sync), the others go on
          if (!locals[name].size && Object.keys(base[name] || {}).length >= 5 && !allow.includes(name)) paused.push(name);
        }
        let changedRemote = !main || copies.length > 0;
        muted = true;
        try {
          for (const [name, k] of Object.entries(kinds)) {
            if (paused.includes(name)) { next[name] = (main && main.data[name]) || { items: {}, deleted: {} }; nextBase[name] = base[name]; counts[name] = (s.counts || {})[name] || 0; continue; }
            const local = locals[name];
            const { items, deleted } = merge(local, sources.map((d) => d[name] || {}), base[name] || {}, now, (s.touched || {})[name], me);
            const sameAsLocal = items.size === local.size && [...items].every(([key, e]) => local.has(key) && hash(local.get(key).v) === hash(e.v) && local.get(key).t === e.t);
            if (!sameAsLocal) k.apply(items);
            const out = { items: Object.fromEntries(items), deleted: Object.fromEntries(deleted) };
            const before = main && main.data[name];
            const canon = (c) => JSON.stringify(Object.entries(c || {}).sort());
            const sig = (o) => JSON.stringify([Object.entries(o.items || {}).map(([key, e]) => [key, hash(e.v), +e.t, canon(e.c)]).sort(), Object.entries(o.deleted || {}).map(([key, d]) => [key, +d[0], canon(d[1])]).sort()]);
            if (!before || sig(before) !== sig(out)) changedRemote = true;
            next[name] = out;
            nextBase[name] = Object.fromEntries([...items].map(([key, e]) => [key, [hash(e.v), e.c]]));
            counts[name] = items.size;
          }
        } finally { muted = false; }
        if (changedRemote) lastMtime = writeRemote(s.dir, pass, salt, next);
        else try { lastMtime = fs.statSync(fileIn(s.dir)).mtimeMs; } catch {}
        for (const c of copies) try { fs.unlinkSync(c.file); } catch {}
        const label = { bookmarks: 'bookmarks', passwords: 'passwords', cards: 'payment cards' };
        const error = paused.length ? `All your ${paused.map((n) => label[n]).join(' and ')} are gone on this computer since the last sync. Sync left them alone on your other computers until you choose below.` : '';
        saveState({ ...state(), me, base: nextBase, last: paused.length ? s.last || 0 : Date.now(), error, counts, paused, allowEmpty: [], touched: paused.length ? s.touched || {} : {} });
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
    store.write = function (name) {
      const r = write.apply(this, arguments);
      const m = /^(bookmarks|passwords|cards)\.json$/.exec(name);
      if (!muted && m && status().on) { const st = state(); write.call(store, 'sync-state.json', { ...st, touched: { ...(st.touched || {}), [m[1]]: Date.now() } }); soon(); }
      return r;
    };
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
      saveState({ me: state().me, dir, pass: enc(pass), base: {}, last: 0, error: '' });
      const r = await syncNow(); startPolling(); return r;
    },
    // Answer to a pause: 'delete' spreads the deletes everywhere; 'restore' brings them back here from the sync file.
    resolve(name, choice) {
      const s = state(); if (!(s.paused || []).includes(name)) return status();
      if (choice === 'delete') saveState({ ...s, allowEmpty: [...(s.allowEmpty || []), name] });
      else if (choice === 'restore') saveState({ ...s, base: { ...(s.base || {}), [name]: {} } });
      return syncNow();
    },
    disable() { clearInterval(poll); clearTimeout(timer); saveState({ me: state().me }); broadcast('sync:changed', status()); return status(); },
    start() { watchStore(); if (status().on) { setTimeout(syncNow, 5000); startPolling(); } },
  };
};
