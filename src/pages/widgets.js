'use strict';
/* New-tab widgets: weather, notes, to-do, clock, calendar, countdown.
   Added/removed from the Customize panel. Drag a widget by its header to put it anywhere on the page
   (position saved as a fraction of the window); "Put back" returns it to the grid. Stored in widgets.json via main. */
const WIDGETS = {
  weather: { name: 'Weather', icon: '⛅' },
  notes: { name: 'Notes', icon: '📝' },
  todo: { name: 'To-do', icon: '✅' },
  clock: { name: 'Clock', icon: '🕰️' },
  calendar: { name: 'Calendar', icon: '📅' },
  countdown: { name: 'Countdown', icon: '⏳' }
};
let widgets = [];
let lastSaved = '';
let saveT;
function saveWidgets(now) {
  clearTimeout(saveT);
  const go = () => { lastSaved = JSON.stringify(widgets); call('widgets:set', widgets).catch(() => toast('Couldn’t save the widget')); };
  if (now) go(); else saveT = setTimeout(go, 400);
}
const svgIcon = (d) => icon(d);
const ICO = {
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  x: '<path d="M7 7l10 10M17 7L7 17"/>',
  back: '<path d="M9 14l-5-5 5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>'
};
const layer = el('div', 'widget-layer'); document.body.appendChild(layer);

/* ---------------- rendering ---------------- */
function placeCard(card, pos) {
  const r = card.getBoundingClientRect();
  const x = Math.max(4, Math.min(innerWidth - r.width - 4, pos.x * innerWidth));
  const y = Math.max(4, Math.min(innerHeight - Math.min(r.height, 60) - 4, pos.y * innerHeight));
  card.style.left = Math.round(x) + 'px'; card.style.top = Math.round(y) + 'px';
}
function renderWidgets() {
  const box = $('widgets'); box.replaceChildren(); layer.replaceChildren();
  box.classList.toggle('hidden', !widgets.some((w) => !w.pos));
  widgets.forEach((w, i) => {
    const card = el('article', 'widget wt-' + w.type + (w.pos ? ' floating' : '')); card.dataset.id = w.id;
    if (w.type === 'custom' && typeof styleCustomCard === 'function') styleCustomCard(card, w);
    const head = el('div', 'w-head');
    head.appendChild(el('span', 'w-title', w.config.title || WIDGETS[w.type].name));
    const tools = el('div', 'w-tools');
    if (['weather', 'clock', 'countdown'].includes(w.type)) {
      const g = el('button', 'w-tool'); g.title = 'Settings'; g.appendChild(svgIcon(ICO.gear));
      g.addEventListener('click', () => { card.classList.toggle('editing'); fill(); });
      tools.appendChild(g);
    }
    if (w.type === 'custom') {
      const g = el('button', 'w-tool'); g.title = 'Edit widget'; g.appendChild(svgIcon(ICO.edit));
      g.addEventListener('click', () => openWidgetEditor(w));
      tools.appendChild(g);
    }
    if (w.pos) {
      const b = el('button', 'w-tool'); b.title = 'Put back in the grid'; b.appendChild(svgIcon(ICO.back));
      b.addEventListener('click', () => { delete w.pos; saveWidgets(true); renderWidgets(); });
      tools.appendChild(b);
    }
    const x = el('button', 'w-tool'); x.title = 'Remove widget'; x.appendChild(svgIcon(ICO.x));
    x.addEventListener('click', () => { widgets.splice(i, 1); saveWidgets(true); renderWidgets(); paintWidgetPicker(); });
    tools.appendChild(x);
    head.appendChild(tools);
    const body = el('div', 'w-body');
    card.append(head, body);
    const fill = () => { body.replaceChildren(); (RENDER[w.type] || (() => {}))(w, body, card); };
    fill();
    // Drag by the header to anywhere on the page: spring-follows the pointer on the GPU, tilts with the motion,
    // and settles into place on release (no re-render). Grid neighbours glide to close the gap.
    head.addEventListener('pointerdown', (e) => startDrag(e, card, w, head));
    if (w.pos) { layer.appendChild(card); card.style.width = (w.pos.w || 260) + 'px'; placeCard(card, w.pos); }
    else box.appendChild(card);
    void i;
  });
}
function flip(nodes, mutate) {
  const first = new Map(nodes.map((n) => [n, n.getBoundingClientRect()]));
  mutate();
  for (const n of nodes) {
    if (!n.isConnected) continue;
    const a = first.get(n), b = n.getBoundingClientRect();
    const dx = a.left - b.left, dy = a.top - b.top;
    if (dx || dy) n.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
}
function startDrag(e, card, w, head) {
  if (e.button !== 0 || e.target.closest('.w-tools, button, input, a, textarea')) return;
  const box = $('widgets');
  const r0 = card.getBoundingClientRect();
  const d = { sx: e.clientX, sy: e.clientY, ox: e.clientX - r0.left, oy: e.clientY - r0.top, moved: false, fromGrid: !w.pos,
    base: { x: r0.left, y: r0.top }, cur: { x: r0.left, y: r0.top }, tgt: { x: r0.left, y: r0.top }, vx: 0, raf: 0, w: r0.width, h: r0.height };
  const frame = () => {
    d.raf = 0;
    const px = d.cur.x;
    d.cur.x += (d.tgt.x - d.cur.x) * 0.35; d.cur.y += (d.tgt.y - d.cur.y) * 0.35;    // spring follow
    d.vx = d.vx * 0.8 + (d.cur.x - px) * 0.2;
    const tilt = Math.max(-6, Math.min(6, d.vx * 0.6));
    card.style.transform = `translate3d(${d.cur.x - d.base.x}px, ${d.cur.y - d.base.y}px, 0) rotate(${tilt}deg) scale(1.04)`;
    if (Math.abs(d.tgt.x - d.cur.x) > 0.3 || Math.abs(d.tgt.y - d.cur.y) > 0.3 || Math.abs(d.vx) > 0.05) d.raf = requestAnimationFrame(frame);
  };
  const move = (ev) => {
    if (!d.moved) {
      if (Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy) < 5) return;
      d.moved = true;
      const others = [...box.children].filter((c) => c !== card);
      flip(others, () => {
        card.style.width = d.w + 'px'; card.style.left = d.base.x + 'px'; card.style.top = d.base.y + 'px';
        card.classList.add('floating', 'dragging'); layer.appendChild(card);
        box.classList.toggle('hidden', !box.children.length);
      });
    }
    // keep it on screen, with a little rubber band at the edges
    const rb = (v, lo, hi) => (v < lo ? lo - (lo - v) * 0.25 : v > hi ? hi + (v - hi) * 0.25 : v);
    d.tgt.x = rb(ev.clientX - d.ox, 4, innerWidth - d.w - 4);
    d.tgt.y = rb(ev.clientY - d.oy, 4, innerHeight - 60);
    if (!d.raf) d.raf = requestAnimationFrame(frame);
  };
  const up = () => {
    removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    if (!d.moved) return;
    cancelAnimationFrame(d.raf);
    const fx = Math.max(4, Math.min(innerWidth - d.w - 4, d.tgt.x)), fy = Math.max(4, Math.min(innerHeight - 60, d.tgt.y));
    // settle: glide to the final spot, drop the lift and tilt, then pin it with left/top
    card.classList.remove('dragging'); card.classList.add('settling');
    card.style.transform = `translate3d(${fx - d.base.x}px, ${fy - d.base.y}px, 0) rotate(0deg) scale(1)`;
    const done = () => {
      card.classList.remove('settling'); card.style.transform = '';
      card.style.left = Math.round(fx) + 'px'; card.style.top = Math.round(fy) + 'px';
      w.pos = { x: +(fx / innerWidth).toFixed(4), y: +(fy / innerHeight).toFixed(4), w: Math.round(d.w) };
      saveWidgets(true);
      if (d.fromGrid) renderWidgets();   // adds its "Put back" button
    };
    let fired = false; const once = () => { if (!fired) { fired = true; done(); } };
    card.addEventListener('transitionend', once, { once: true }); setTimeout(once, 450);
  };
  // window-level listeners: moving the card into the floating layer would drop pointer capture
  addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}
addEventListener('resize', () => { for (const card of layer.children) { const w = widgets.find((x) => x.id === card.dataset.id); if (w && w.pos) placeCard(card, w.pos); } });
function settingsForm(card, body, fields, onSave) {
  const f = el('form', 'w-form');
  const inputs = fields.map(([label, value, attrs]) => {
    const l = el('label', 'w-field'); l.appendChild(el('span', null, label));
    const inp = el('input', 'cz-input'); Object.assign(inp, attrs || {}); inp.value = value || '';
    l.appendChild(inp); f.appendChild(l); return inp;
  });
  const row = el('div', 'w-form-row'); const ok = el('button', 'btn primary', 'Save'); ok.type = 'submit'; row.appendChild(ok); f.appendChild(row);
  f.addEventListener('submit', async (e) => { e.preventDefault(); ok.disabled = true; const r = await onSave(inputs.map((x) => x.value.trim())); ok.disabled = false; if (r !== false) { card.classList.remove('editing'); saveWidgets(true); renderWidgets(); } });
  body.appendChild(f);
  setTimeout(() => inputs[0] && inputs[0].focus(), 0);
}

/* ---------------- weather (Open-Meteo, no account needed) ---------------- */
const WMO = [[0, '☀️', 'Clear'], [1, '🌤️', 'Mostly clear'], [2, '⛅', 'Partly cloudy'], [3, '☁️', 'Cloudy'], [45, '🌫️', 'Fog'], [48, '🌫️', 'Fog'],
  [51, '🌦️', 'Drizzle'], [55, '🌦️', 'Drizzle'], [61, '🌧️', 'Rain'], [63, '🌧️', 'Rain'], [65, '🌧️', 'Heavy rain'], [66, '🌧️', 'Freezing rain'], [67, '🌧️', 'Freezing rain'],
  [71, '🌨️', 'Snow'], [73, '🌨️', 'Snow'], [75, '❄️', 'Heavy snow'], [77, '🌨️', 'Snow grains'], [80, '🌦️', 'Showers'], [81, '🌧️', 'Showers'], [82, '⛈️', 'Heavy showers'],
  [85, '🌨️', 'Snow showers'], [86, '🌨️', 'Snow showers'], [95, '⛈️', 'Thunderstorm'], [96, '⛈️', 'Thunderstorm'], [99, '⛈️', 'Thunderstorm']];
const wmo = (c) => { let best = WMO[0]; for (const x of WMO) if (x[0] <= c) best = x; return best; };
const weatherCache = new Map();
async function weatherData(cfg) {
  const key = `${cfg.lat},${cfg.lon},${cfg.unit}`;
  const c = weatherCache.get(key); if (c && Date.now() - c.at < 15 * 60e3) return c.data;
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${cfg.lat}&longitude=${cfg.lon}&current=temperature_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=4&timezone=auto${cfg.unit === 'f' ? '&temperature_unit=fahrenheit' : ''}`;
  const data = await (await fetch(u)).json();
  weatherCache.set(key, { at: Date.now(), data });
  return data;
}
const RENDER = {
  weather(w, body, card) {
    const cfg = w.config;
    if (card.classList.contains('editing') || cfg.lat == null) {
      settingsForm(card, body, [['City', cfg.city, { placeholder: 'e.g. Stockholm', required: true }], ['Units (C or F)', (cfg.unit || 'c').toUpperCase(), { maxLength: 1 }]], async ([city, unit]) => {
        try {
          const r = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(city)}`)).json();
          const p = r.results && r.results[0];
          if (!p) { toast('Couldn’t find that city'); return false; }
          Object.assign(cfg, { city: p.name + (p.country_code ? ', ' + p.country_code : ''), lat: +p.latitude.toFixed(3), lon: +p.longitude.toFixed(3), unit: /f/i.test(unit) ? 'f' : 'c' });
        } catch { toast('No connection to the weather service'); return false; }
      });
      return;
    }
    body.appendChild(el('div', 'w-muted', 'Loading…'));
    weatherData(cfg).then((d) => {
      body.replaceChildren();
      const [, ic, label] = wmo(d.current.weather_code);
      const now = el('div', 'wx-now');
      now.append(el('span', 'wx-ic', ic), el('span', 'wx-temp', Math.round(d.current.temperature_2m) + '°'));
      const info = el('div', 'wx-info'); info.append(el('b', null, cfg.city), el('span', null, `${label} · wind ${Math.round(d.current.wind_speed_10m)} km/h`));
      now.appendChild(info);
      const days = el('div', 'wx-days');
      d.daily.time.slice(1, 4).forEach((t, k) => {
        const dd = el('div', 'wx-day');
        dd.append(el('span', null, new Date(t + 'T12:00').toLocaleDateString([], { weekday: 'short' })), el('span', 'wx-dic', wmo(d.daily.weather_code[k + 1])[1]),
          el('span', null, `${Math.round(d.daily.temperature_2m_max[k + 1])}° / ${Math.round(d.daily.temperature_2m_min[k + 1])}°`));
        days.appendChild(dd);
      });
      body.append(now, days);
    }).catch(() => { body.replaceChildren(el('div', 'w-muted', 'Weather unavailable right now.')); });
  },

  notes(w, body) {
    const t = el('textarea', 'w-notes'); t.placeholder = 'Write something…'; t.maxLength = 8000; t.value = w.config.text || '';
    t.addEventListener('input', () => { w.config.text = t.value; saveWidgets(); });
    body.appendChild(t);
  },

  todo(w, body) {
    const items = w.config.items = Array.isArray(w.config.items) ? w.config.items : [];
    const list = el('ul', 'w-todo');
    const draw = () => {
      list.replaceChildren();
      items.forEach((it, i) => {
        const li = el('li', it.done ? 'done' : '');
        const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!it.done;
        cb.addEventListener('change', () => { it.done = cb.checked; li.classList.toggle('done', it.done); saveWidgets(); });
        const tx = el('span', null, it.text);
        const del = el('button', 'w-tool'); del.title = 'Delete'; del.appendChild(svgIcon(ICO.x));
        del.addEventListener('click', () => { items.splice(i, 1); draw(); saveWidgets(); });
        li.append(cb, tx, del); list.appendChild(li);
      });
      if (!items.length) list.appendChild(el('li', 'w-muted empty', 'Nothing to do. Nice.'));
    };
    const add = el('form', 'w-add'); const inp = el('input', 'cz-input'); inp.placeholder = 'Add a task and press Enter'; inp.maxLength = 200;
    add.appendChild(inp);
    add.addEventListener('submit', (e) => { e.preventDefault(); const v = inp.value.trim(); if (!v) return; items.push({ text: v, done: false }); inp.value = ''; draw(); saveWidgets(); });
    draw(); body.append(list, add);
  },

  clock(w, body, card) {
    const cfg = w.config;
    if (card.classList.contains('editing')) {
      settingsForm(card, body, [['Time zone or city', cfg.zone || '', { placeholder: 'e.g. Asia/Tokyo or New York' }], ['Label', cfg.label || '', { placeholder: 'Tokyo', maxLength: 30 }]], ([zone, label]) => {
        const z = resolveZone(zone);
        if (zone && !z) { toast('Unknown time zone — try “Europe/London” or a big city'); return false; }
        Object.assign(cfg, { zone: z || '', label: label || (z ? z.split('/').pop().replace(/_/g, ' ') : '') });
      });
      return;
    }
    const time = el('div', 'clk-time'); const sub = el('div', 'clk-sub');
    let shown = false;
    const tick = () => {
      if (shown && !body.isConnected) return clearInterval(iv);   // widget removed or re-rendered
      shown = true;
      const opts = cfg.zone ? { timeZone: cfg.zone } : {};
      const d = new Date();
      time.textContent = d.toLocaleTimeString([], Object.assign({ hour: '2-digit', minute: '2-digit', second: '2-digit' }, opts));
      sub.textContent = `${cfg.label || 'Local time'} · ${d.toLocaleDateString([], Object.assign({ weekday: 'long', day: 'numeric', month: 'short' }, opts))}`;
    };
    const iv = setInterval(tick, 1000); tick();
    body.append(time, sub);
  },

  calendar(w, body) {
    const cfg = w.config; const now = new Date();
    let y = now.getFullYear(), m = now.getMonth();
    const draw = () => {
      body.replaceChildren();
      const head = el('div', 'cal-head');
      const prev = el('button', 'w-tool', '‹'); const next = el('button', 'w-tool', '›');
      prev.addEventListener('click', () => { m--; if (m < 0) { m = 11; y--; } draw(); });
      next.addEventListener('click', () => { m++; if (m > 11) { m = 0; y++; } draw(); });
      head.append(prev, el('b', null, new Date(y, m, 1).toLocaleDateString([], { month: 'long', year: 'numeric' })), next);
      const grid = el('div', 'cal-grid');
      const start = (new Date(y, m, 1).getDay() + 6) % 7;   // weeks start on Monday
      for (let i = 0; i < 7; i++) grid.appendChild(el('span', 'cal-dow', new Date(2024, 0, 1 + i).toLocaleDateString([], { weekday: 'narrow' })));
      for (let i = 0; i < start; i++) grid.appendChild(el('span'));
      const days = new Date(y, m + 1, 0).getDate();
      for (let d = 1; d <= days; d++) grid.appendChild(el('span', 'cal-day' + (y === now.getFullYear() && m === now.getMonth() && d === now.getDate() ? ' today' : ''), String(d)));
      body.append(head, grid);
    };
    void cfg; draw();
  },

  countdown(w, body, card) {
    const cfg = w.config;
    if (card.classList.contains('editing') || !cfg.date) {
      settingsForm(card, body, [['What are you counting down to?', cfg.label || '', { placeholder: 'Summer holiday', maxLength: 40, required: true }], ['Date', cfg.date || '', { type: 'date', required: true }]], ([label, date]) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('Pick a date'); return false; }
        Object.assign(cfg, { label, date });
      });
      return;
    }
    const target = new Date(cfg.date + 'T00:00');
    const days = Math.ceil((target - new Date().setHours(0, 0, 0, 0)) / 864e5);
    body.append(el('div', 'cd-num', days > 0 ? String(days) : days === 0 ? '🎉' : String(-days)),
      el('div', 'clk-sub', days > 0 ? `${days === 1 ? 'day' : 'days'} until ${cfg.label}` : days === 0 ? `${cfg.label} is today!` : `${-days === 1 ? 'day' : 'days'} since ${cfg.label}`));
  }
};
const CITY_ZONES = { 'new york': 'America/New_York', 'los angeles': 'America/Los_Angeles', london: 'Europe/London', paris: 'Europe/Paris', berlin: 'Europe/Berlin',
  stockholm: 'Europe/Stockholm', tokyo: 'Asia/Tokyo', sydney: 'Australia/Sydney', dubai: 'Asia/Dubai', singapore: 'Asia/Singapore', 'hong kong': 'Asia/Hong_Kong',
  chicago: 'America/Chicago', toronto: 'America/Toronto', 'san francisco': 'America/Los_Angeles', seoul: 'Asia/Seoul', mumbai: 'Asia/Kolkata', delhi: 'Asia/Kolkata', 'são paulo': 'America/Sao_Paulo', 'sao paulo': 'America/Sao_Paulo' };
function resolveZone(s) {
  if (!s) return '';
  const z = CITY_ZONES[s.toLowerCase()] || s.replace(/ /g, '_');
  try { new Intl.DateTimeFormat([], { timeZone: z }); return z; } catch {}
  const hit = (Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : []).find((x) => x.toLowerCase().endsWith('/' + s.toLowerCase().replace(/ /g, '_')));
  return hit || null;
}

/* ---------------- customize panel: add widgets ---------------- */
function paintWidgetPicker() {
  const box = $('czWidgets'); if (!box) return;
  box.replaceChildren();
  for (const [type, w] of Object.entries(WIDGETS)) {
    const n = widgets.filter((x) => x.type === type).length;
    const b = el('button', 'cz-wbtn' + (n ? ' on' : ''));
    b.append(el('span', 'cz-wic', w.icon), el('span', null, w.name));
    if (n) b.appendChild(el('span', 'cz-wn', '×' + n));
    b.title = `Add a ${w.name} widget`;
    b.addEventListener('click', () => {
      if (widgets.length >= 20) { toast('That’s a lot of widgets. Remove one first.'); return; }
      widgets.push({ id: 'w' + Date.now().toString(36), type, config: type === 'todo' ? { items: [] } : {} });
      saveWidgets(true); renderWidgets(); paintWidgetPicker();
      const last = $('widgets').lastElementChild; if (last) last.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    box.appendChild(b);
  }
}
$('customizeBtn').addEventListener('click', () => paintWidgetPicker());
S.on('widgets:changed', (l) => { if (JSON.stringify(l) === lastSaved) return; widgets = l; renderWidgets(); paintWidgetPicker(); });
call('widgets:get').then((l) => { widgets = Array.isArray(l) ? l : []; renderWidgets(); paintWidgetPicker(); }).catch(() => {});
