'use strict';
/* Stupid TV: a calm home screen for Samsung Smart Monitors and TVs (Tizen web app).
   Runs in an ordinary browser too, for previewing: arrow keys, Enter, Backspace/Esc = Back, E = edit, S = settings. */
(function () {
  var TIZEN = typeof window.tizen !== 'undefined';
  var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 10009, RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406, ESC: 27, BACKSPACE: 8 };
  var DIRS = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' };
  var STORE = 'stupidtv.v1';
  var SAVER_STEPS = [0, 5, 10, 30];
  var $ = function (id) { return document.getElementById(id); };

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }

  /* ---------------- state ---------------- */
  var state = load();
  function defaults() { return { name: '', city: '', place: null, clock24: true, accent: 'clay', saver: 10, rows: clone(DEFAULT_ROWS) }; }
  function load() {
    var d = defaults();
    try {
      var s = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (s && typeof s === 'object') { for (var k in d) if (k in s) d[k] = s[k]; }
    } catch (e) {}
    if (!Array.isArray(d.rows) || !d.rows.length) d.rows = clone(DEFAULT_ROWS);
    return d;
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { toast('Couldn’t save that'); } }

  var toastT;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.add('hidden'); }, 2600); }

  /* ---------------- remote keys ---------------- */
  if (TIZEN) {
    try {
      ['ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue'].forEach(function (k) { tizen.tvinputdevice.registerKey(k); });
    } catch (e) {}
  }

  /* ---------------- clock, greeting, date ---------------- */
  function timeText(d) {
    var h = d.getHours(), m = ('0' + d.getMinutes()).slice(-2);
    if (state.clock24) return ('0' + h).slice(-2) + ':' + m;
    return ((h % 12) || 12) + ':' + m;
  }
  function dateText(d) {
    try { return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }); } catch (e) { return d.toDateString(); }
  }
  function greetText(d) {
    var h = d.getHours();
    var part = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    return state.name ? part + ', ' + state.name : part;
  }
  function tick() {
    var d = new Date();
    $('clock').textContent = timeText(d);
    $('greeting').textContent = greetText(d);
    $('date').textContent = dateText(d);
    $('saverClock').textContent = timeText(d);
    $('saverSub').textContent = dateText(d);
  }

  /* ---------------- weather (Open-Meteo: free, no account) ---------------- */
  var SKY = [[0, 'Clear'], [1, 'Mostly clear'], [2, 'Partly cloudy'], [3, 'Cloudy'], [48, 'Fog'], [57, 'Drizzle'], [67, 'Rain'], [77, 'Snow'], [82, 'Showers'], [86, 'Snow showers'], [99, 'Thunderstorm']];
  function skyText(code) { for (var i = 0; i < SKY.length; i++) if (code <= SKY[i][0]) return SKY[i][1]; return ''; }
  function getJson(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  function findPlace(city) {
    return getJson('https://geocoding-api.open-meteo.com/v1/search?count=1&name=' + encodeURIComponent(city)).then(function (j) {
      var p = j && j.results && j.results[0];
      if (!p) throw new Error('no place');
      return { lat: p.latitude, lon: p.longitude, label: p.name };
    });
  }
  function weather() {
    if (!state.city) { $('weather').classList.add('hidden'); return; }
    var placed = state.place && state.place.city === state.city ? Promise.resolve(state.place) : findPlace(state.city).then(function (p) { p.city = state.city; state.place = p; save(); return p; });
    placed.then(function (p) {
      return getJson('https://api.open-meteo.com/v1/forecast?current=temperature_2m,weather_code&latitude=' + p.lat + '&longitude=' + p.lon).then(function (j) {
        var c = j.current || {};
        $('wTemp').textContent = Math.round(c.temperature_2m) + '°';
        $('wSky').textContent = skyText(c.weather_code);
        $('wCity').textContent = p.label;
        $('weather').classList.remove('hidden');
      });
    }).catch(function () { $('weather').classList.add('hidden'); });
  }

  /* ---------------- opening apps and sites ---------------- */
  function openUrl(url, name) {
    if (!TIZEN) { window.open(url, '_blank'); return; }
    try {
      var ctl = new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/view', url, null, null, null);
      tizen.application.launchAppControl(ctl, BROWSER_APP, function () {}, function () { toast('Couldn’t open ' + name); });
    } catch (e) { toast('Couldn’t open ' + name); }
  }
  // Tries each installed-app ID in turn, then falls back to the website.
  function launch(tile) {
    toast('Opening ' + tile.name + '…');
    var ids = (TIZEN && tile.apps) || [];
    var i = 0;
    (function next() {
      if (i >= ids.length) { if (tile.url) openUrl(tile.url, tile.name); else toast(tile.name + ' isn’t installed'); return; }
      var id = ids[i++];
      try { tizen.application.launch(id, function () {}, next); } catch (e) { next(); }
    })();
  }

  /* ---------------- home screen ---------------- */
  function tileEl(tile, r, t) {
    var b = el('button', 'tile ' + (tile.color ? 'app' : 'site'));
    b.setAttribute('data-nav', '');
    b.setAttribute('data-row', r); b.setAttribute('data-tile', t);
    if (tile.color) {
      b.style.background = tile.color;
      var nm = el('span', 'brand', tile.name);
      nm.style.color = tile.ink || '#fff';
      b.appendChild(nm);
    } else {
      var ic = el('span', 'site-ic', (tile.name || '?').charAt(0).toUpperCase());
      var host = hostOf(tile.url);
      if (host) {
        var img = new Image();
        img.onload = function () { if (img.naturalWidth > 1) { ic.textContent = ''; ic.appendChild(img); } };
        img.src = 'https://icons.duckduckgo.com/ip3/' + host + '.ico';
      }
      b.appendChild(ic);
      b.appendChild(el('span', 'site-name', tile.name));
      b.appendChild(el('span', 'site-host', host));
    }
    b.addEventListener('click', function () { launch(tile); });
    return b;
  }
  function render(focusRow, focusTile) {
    var main = $('rows'); main.innerHTML = '';
    state.rows.forEach(function (row, r) {
      var sec = el('section', 'row');
      sec.appendChild(el('h2', 'row-title', row.title));
      var strip = el('div', 'strip');
      row.tiles.forEach(function (tile, t) { strip.appendChild(tileEl(tile, r, t)); });
      var add = el('button', 'tile add');
      add.setAttribute('data-nav', ''); add.setAttribute('data-row', r); add.setAttribute('data-add', '');
      add.appendChild(el('span', 'plus', '+'));
      add.appendChild(el('span', 'add-text', 'Add'));
      add.addEventListener('click', function () { addSheet(r); });
      strip.appendChild(add);
      sec.appendChild(strip);
      main.appendChild(sec);
    });
    if (focusRow != null) {
      var sel = '[data-row="' + focusRow + '"]' + (focusTile != null ? '[data-tile="' + focusTile + '"]' : '[data-add]');
      Nav.focus(document.querySelector(sel) || document.querySelector('[data-row="' + focusRow + '"]'));
    }
  }
  function applyLook() {
    document.documentElement.style.setProperty('--accent', ACCENTS[state.accent] || ACCENTS.clay);
  }

  /* ---------------- dialogs ---------------- */
  var returnFocus = null;
  function openSheet(title, build) {
    if ($('sheet').classList.contains('hidden')) returnFocus = document.activeElement;
    $('sheetTitle').textContent = title;
    var body = $('sheetBody'); body.innerHTML = '';
    build(body);
    $('sheet').classList.remove('hidden');
    Nav.focus(Nav.items()[0]);
  }
  function closeSheet() {
    $('sheet').classList.add('hidden');
    var f = returnFocus; returnFocus = null;
    if (f && document.body.contains(f)) Nav.focus(f); else Nav.focus(Nav.items()[0]);
  }
  function button(label, fn, cls) {
    var b = el('button', 'btn' + (cls ? ' ' + cls : ''), label);
    b.setAttribute('data-nav', '');
    b.addEventListener('click', fn);
    return b;
  }
  function field(label, value, placeholder) {
    var wrap = el('label', 'field');
    wrap.appendChild(el('span', 'field-label', label));
    var input = el('input', 'input');
    input.type = 'text'; input.value = value || ''; input.placeholder = placeholder || '';
    input.setAttribute('data-nav', ''); input.spellcheck = false; input.autocomplete = 'off';
    wrap.appendChild(input);
    return { wrap: wrap, input: input };
  }
  function actions() { return el('div', 'actions'); }

  function normalizeUrl(text) {
    var v = String(text || '').trim();
    if (!v) return '';
    if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
    try { var u = new URL(v); return u.hostname.indexOf('.') > 0 ? u.href : ''; } catch (e) { return ''; }
  }

  function tileSheet(r, t) {
    var row = state.rows[r], tile = row.tiles[t];
    openSheet(tile.name, function (body) {
      var a = el('div', 'menu');
      if (t > 0) a.appendChild(button('Move left', function () { move(r, t, -1); }));
      if (t < row.tiles.length - 1) a.appendChild(button('Move right', function () { move(r, t, 1); }));
      a.appendChild(button('Edit name and address', function () { editSheet(r, t); }));
      a.appendChild(button('Remove from ' + row.title, function () {
        row.tiles.splice(t, 1); save(); returnFocus = null; closeSheet();
        render(r, row.tiles.length ? Math.min(t, row.tiles.length - 1) : null);
        toast(tile.name + ' removed');
      }, 'danger'));
      a.appendChild(button('Cancel', closeSheet, 'quiet'));
      body.appendChild(a);
    });
  }
  function move(r, t, d) {
    var tiles = state.rows[r].tiles, x = tiles.splice(t, 1)[0];
    tiles.splice(t + d, 0, x); save();
    returnFocus = null; closeSheet(); render(r, t + d);
  }
  function tileForm(body, tile, onSave) {
    var name = field('Name', tile && tile.name, 'Netflix');
    var url = field('Website address', tile && tile.url, 'netflix.com');
    var app = field('Samsung app ID (optional)', tile && tile.apps && tile.apps.join(', '), 'Opens the app instead of the website');
    var note = el('p', 'note', 'Leave the app ID empty to open the website in the TV’s browser.');
    body.appendChild(name.wrap); body.appendChild(url.wrap); body.appendChild(app.wrap); body.appendChild(note);
    var act = actions();
    act.appendChild(button('Save', function () {
      var n = name.input.value.trim(), u = normalizeUrl(url.input.value);
      var ids = app.input.value.split(/[\s,]+/).filter(function (x) { return /^[A-Za-z0-9._]{3,40}$/.test(x); });
      if (!n) { toast('Give it a name'); Nav.focus(name.input); return; }
      if (!u && !ids.length) { toast('Add a website address or an app ID'); Nav.focus(url.input); return; }
      onSave({ name: n.slice(0, 32), url: u, apps: ids });
    }, 'primary'));
    act.appendChild(button('Cancel', closeSheet, 'quiet'));
    body.appendChild(act);
  }
  function editSheet(r, t) {
    var old = state.rows[r].tiles[t];
    openSheet('Edit ' + old.name, function (body) {
      tileForm(body, old, function (v) {
        var tile = Object.assign({}, old, v);
        if (tile.apps.length && !tile.color) tile.color = ACCENTS[state.accent] || ACCENTS.clay;
        state.rows[r].tiles[t] = tile; save(); returnFocus = null; closeSheet(); render(r, t);
      });
    });
  }
  function addSheet(r) {
    openSheet('Add to ' + state.rows[r].title, function (body) {
      tileForm(body, null, function (v) {
        if (v.apps.length) v.color = ACCENTS[state.accent] || ACCENTS.clay;
        state.rows[r].tiles.push(v); save(); returnFocus = null; closeSheet();
        render(r, state.rows[r].tiles.length - 1); toast(v.name + ' added');
      });
    });
  }

  function settingsSheet() {
    openSheet('Settings', function (body) {
      var name = field('Your name', state.name, 'Shown in the greeting');
      var city = field('Weather for', state.city, 'Stockholm');
      body.appendChild(name.wrap); body.appendChild(city.wrap);

      var opts = el('div', 'opts');
      var clockBtn = button('', function () { state.clock24 = !state.clock24; paint(); tick(); save(); }, 'opt');
      var saverBtn = button('', function () {
        var i = SAVER_STEPS.indexOf(state.saver);
        state.saver = SAVER_STEPS[(i + 1) % SAVER_STEPS.length]; paint(); save(); idle();
      }, 'opt');
      function paint() {
        clockBtn.textContent = state.clock24 ? '24-hour clock' : '12-hour clock';
        saverBtn.textContent = 'Screensaver: ' + (state.saver ? state.saver + ' min' : 'off');
      }
      paint();
      opts.appendChild(clockBtn); opts.appendChild(saverBtn);
      body.appendChild(opts);

      body.appendChild(el('span', 'field-label', 'Color'));
      var sw = el('div', 'swatches');
      Object.keys(ACCENTS).forEach(function (k) {
        var b = button('', function () { state.accent = k; applyLook(); save(); mark(); }, 'swatch');
        b.style.background = ACCENTS[k]; b.setAttribute('aria-label', k); b.setAttribute('data-k', k);
        sw.appendChild(b);
      });
      function mark() { var all = sw.children; for (var i = 0; i < all.length; i++) all[i].classList.toggle('on', all[i].getAttribute('data-k') === state.accent); }
      mark();
      body.appendChild(sw);

      var act = actions();
      act.appendChild(button('Done', function () {
        state.name = name.input.value.trim().slice(0, 24);
        var c = city.input.value.trim().slice(0, 60);
        if (c !== state.city) { state.city = c; state.place = null; }
        save(); tick(); weather(); closeSheet();
      }, 'primary'));
      act.appendChild(button('Reset home screen', function () { confirmReset(); }, 'quiet'));
      body.appendChild(act);
    });
  }
  function confirmReset() {
    openSheet('Reset the home screen?', function (body) {
      body.appendChild(el('p', 'note', 'Your rows go back to the original apps and sites. Name, weather and color stay.'));
      var act = actions();
      act.appendChild(button('Reset', function () { state.rows = clone(DEFAULT_ROWS); save(); returnFocus = null; closeSheet(); render(0, 0); toast('Home screen reset'); }, 'danger'));
      act.appendChild(button('Cancel', function () { returnFocus = null; closeSheet(); Nav.focus($('settingsBtn')); }, 'quiet'));
      body.appendChild(act);
    });
  }

  /* ---------------- screensaver ---------------- */
  var idleT, driftT;
  function idle() {
    clearTimeout(idleT);
    if (state.saver) idleT = setTimeout(showSaver, state.saver * 60000);
  }
  function drift() {
    var s = $('saverInner');
    s.style.transform = 'translate(' + Math.round(Math.random() * 900 - 450) + 'px,' + Math.round(Math.random() * 500 - 250) + 'px)';
  }
  function showSaver() { $('saver').classList.remove('hidden'); drift(); driftT = setInterval(drift, 60000); }
  function hideSaver() { $('saver').classList.add('hidden'); clearInterval(driftT); }

  /* ---------------- key handling ---------------- */
  var pressT = null, longFired = false;
  function isInput(x) { return x && x.tagName === 'INPUT'; }
  function goBack() {
    if (!$('sheet').classList.contains('hidden')) { closeSheet(); return; }
    // At the top level, Back hides the app (it keeps running, so it opens instantly next time).
    if (TIZEN) { try { tizen.application.getCurrentApplication().hide(); } catch (e) {} }
  }
  function editFocused() {
    var a = document.activeElement;
    if (a && a.hasAttribute('data-tile') && $('sheet').classList.contains('hidden')) tileSheet(+a.getAttribute('data-row'), +a.getAttribute('data-tile'));
  }

  document.addEventListener('keydown', function (e) {
    idle();
    if (!$('saver').classList.contains('hidden')) { hideSaver(); e.preventDefault(); return; }
    var k = e.keyCode, a = document.activeElement, typing = isInput(a);

    if (DIRS[k]) {
      if (typing && (k === KEY.LEFT || k === KEY.RIGHT)) return;   // move the text cursor
      e.preventDefault(); Nav.move(DIRS[k]); return;
    }
    if (k === KEY.ENTER) {
      if (typing) { e.preventDefault(); Nav.move('down'); return; }
      e.preventDefault();
      if (e.repeat || pressT) return;
      longFired = false;
      // Hold OK on a tile to edit it (for remotes without colour buttons).
      if (a && a.hasAttribute('data-tile')) pressT = setTimeout(function () { pressT = null; longFired = true; editFocused(); }, 700);
      else pressT = -1;
      return;
    }
    if (k === KEY.BACK || k === KEY.ESC || (k === KEY.BACKSPACE && !typing)) { e.preventDefault(); goBack(); return; }
    if (k === KEY.RED || (!typing && e.key === 'e')) { e.preventDefault(); editFocused(); return; }
    if (k === KEY.BLUE || (!typing && e.key === 's')) { e.preventDefault(); if ($('sheet').classList.contains('hidden')) settingsSheet(); return; }
  });
  document.addEventListener('keyup', function (e) {
    if (e.keyCode !== KEY.ENTER || pressT === null) return;
    if (pressT !== -1) clearTimeout(pressT);
    pressT = null;
    var a = document.activeElement;
    if (!longFired && a && !isInput(a) && a.click) a.click();
  });
  document.addEventListener('mousemove', idle);
  document.addEventListener('mousedown', function () { if (!$('saver').classList.contains('hidden')) hideSaver(); idle(); });
  // Clicks on the dimmed backdrop close the dialog (preview with a mouse).
  $('sheet').addEventListener('click', function (e) { if (e.target === $('sheet')) closeSheet(); });
  $('settingsBtn').addEventListener('click', settingsSheet);

  // Coming back to the app (after watching something) lands on a fresh clock and weather.
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { tick(); weather(); idle(); } });

  /* ---------------- preview scaling ---------------- */
  // The TV renders at 1920×1080; in an ordinary browser window, scale the whole page to fit.
  function fit() {
    var z = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    document.body.style.zoom = Math.abs(z - 1) < 0.01 ? '' : String(z);
  }
  if (!TIZEN) { fit(); window.addEventListener('resize', fit); }

  /* ---------------- start ---------------- */
  applyLook();
  render(0, 0);
  tick();
  setInterval(tick, 10000);
  weather();
  setInterval(weather, 30 * 60000);
  idle();
})();
