'use strict';
// Runs in web pages (isolated world). Offers to save passwords on login form submit
// and fills saved ones. Main process checks the frame origin, so a page only ever sees its own logins.
const { ipcRenderer } = require('electron');
if (/^https?:$/.test(location.protocol)) {
  const pwFields = (root) => [...root.querySelectorAll('input[type="password"]')].filter((i) => !i.disabled);
  function userFieldFor(pw) {
    const form = pw.form || document;
    const inputs = [...form.querySelectorAll('input')].filter((i) => !i.disabled && /^(text|email|tel|)$/.test(i.type) && i.offsetParent !== null);
    const before = inputs.filter((i) => i.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING);
    return before.pop() || inputs.find((i) => /user|mail|login/i.test(i.name + i.id + i.autocomplete)) || null;
  }
  let lastSent = '';
  // Clicks only matter once the page has a password field (found by check() below or focused by the user),
  // so ordinary clicks on busy pages cost nothing.
  let pwSeen = false;
  function capture(pw) {
    if (!pw || !pw.value) return;
    const u = userFieldFor(pw);
    const key = (u ? u.value : '') + '\u0000' + pw.value;
    if (key === lastSent) return;
    lastSent = key;
    ipcRenderer.send('pw:submitted', { username: u ? u.value : '', password: pw.value });
  }
  document.addEventListener('submit', (e) => { const pw = pwFields(e.target)[0]; capture(pw); }, true);
  // Many sites log in with a button click instead of a real submit.
  document.addEventListener('click', (e) => {
    if (!pwSeen) return;
    const b = e.target.closest && e.target.closest('button, input[type="submit"], [role="button"]');
    if (!b) return;
    const root = b.form || document;
    const pw = pwFields(root).find((p) => p.value);
    if (pw) setTimeout(() => capture(pw), 0);
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target && e.target.type === 'password') capture(e.target); }, true);

  let filled = false;
  async function tryFill() {
    if (filled) return;
    const pw = pwFields(document).find((p) => p.offsetParent !== null);
    if (!pw) return;
    filled = true;
    let creds = [];
    try { creds = await ipcRenderer.invoke('pw:query'); } catch {}
    if (!creds.length) return;
    const c = creds[0];
    const u = userFieldFor(pw);
    const set = (el, v) => {
      const proto = Object.getPrototypeOf(el);
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, v); else el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    if (u && !u.value && c.username) set(u, c.username);
    if (!pw.value) set(pw, c.password);
    pw.style.backgroundColor = 'rgba(217,119,87,.10)';
  }
  // No MutationObserver: watching every DOM change slowed busy pages (and every iframe) down. Instead look a few
  // times while the page settles, and whenever a field gets focus — that's when a login form matters anyway.
  const check = () => { if ((!filled || !pwSeen) && document.querySelector('input[type="password"]')) { pwSeen = true; tryFill(); } };
  const start = () => {
    check();
    for (const ms of [400, 1500, 4000, 10000]) setTimeout(check, ms);
    document.addEventListener('focusin', (e) => { if (e.target && e.target.type === 'password') pwSeen = true; if (!filled && e.target && e.target.tagName === 'INPUT') check(); }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
}

// Payment cards (https pages only). When you pay, the card number, name and expiry are offered for saving (never the
// security code). When you click a card number field, a small list of your saved cards (•••• 1234) shows under it;
// the page gets a card's details only when you pick it. Main checks the page is secure and not private.
if (location.protocol === 'https:') {
  const meta = (e) => [e.autocomplete, e.name, e.id, e.placeholder, e.getAttribute('aria-label'), e.getAttribute('data-elements-stable-field-name')].join(' ').toLowerCase();
  const isField = (e) => e && e.tagName === 'INPUT' && /^(text|tel|number|)$/.test(e.type);
  const kind = (e) => {
    if (!e || !(isField(e) || e.tagName === 'SELECT')) return '';
    const m = meta(e);
    if (/cc-csc|cvc|cvv|security.?code|card.?code|säkerhetskod/.test(m)) return 'csc';
    if (/cc-number|card.?num|cardnumber|cc.?num|kortnummer|numero.?(de.?)?tarjeta|kartennummer/.test(m)) return 'number';
    if (/cc-name|name.?on.?card|card.?holder|cardholder|cc.?name|kortinnehavare/.test(m)) return 'name';
    if (/cc-exp-month|exp.{0,6}month|cc.?month|expiry.?mm|\bmm\b/.test(m) && !/yy/.test(m)) return 'month';
    if (/cc-exp-year|exp.{0,6}year|cc.?year|expiry.?yy/.test(m)) return 'year';
    if (/cc-exp|expir|exp.?date|mm.?\/?.?yy|giltig|valid.?thru/.test(m)) return 'exp';
    return '';
  };
  const fieldsNear = (start) => {
    const root = (start && start.form) || document;
    const out = {};
    for (const e of root.querySelectorAll('input, select')) { const k = kind(e); if (k && !out[k] && (e.offsetParent !== null || e === start)) out[k] = e; }
    return out;
  };
  const set = (e, v) => {
    if (!e || v == null || v === '') return;
    if (e.tagName === 'SELECT') {
      const want = String(v); const o = [...e.options].find((x) => x.value === want || x.value === want.padStart(2, '0') || x.text.trim() === want || x.text.trim() === want.padStart(2, '0') || x.value.endsWith(want.slice(-2)) && want.length === 4 && x.value.length === 2);
      if (o) { e.value = o.value; e.dispatchEvent(new Event('change', { bubbles: true })); }
      return;
    }
    const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e), 'value');
    if (d && d.set) d.set.call(e, v); else e.value = v;
    e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true }));
  };
  // Offer to save when you pay (a real submit or a click on the form's button).
  let lastCard = '';
  const capture = (root) => {
    const f = fieldsNear(root && root.tagName ? root : null);
    const number = f.number && String(f.number.value || '').replace(/\D/g, '');
    if (!number || number.length < 13) return;
    let month = f.month && f.month.value, year = f.year && f.year.value;
    if (f.exp && f.exp.value) { const m = /(\d{1,2})\s*[\/\-. ]\s*(\d{2,4})/.exec(f.exp.value); if (m) { month = m[1]; year = m[2]; } }
    const key = number + '|' + month + '|' + year;
    if (key === lastCard) return; lastCard = key;
    ipcRenderer.send('card:submitted', { number, month, year, name: f.name ? f.name.value : '' });
  };
  document.addEventListener('submit', (e) => capture(e.target.querySelector('input')), true);
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button, input[type="submit"], [role="button"]');
    if (!b) return;
    const f = fieldsNear(b.form ? b.form.querySelector('input') : null);
    if (f.number && f.number.value) setTimeout(() => capture(f.number), 0);
  }, true);
  // Fill: a small list of saved cards under the card number field when you click it.
  let picker = null;
  const close = () => { if (picker) { picker.remove(); picker = null; } };
  document.addEventListener('focusin', async (e) => {
    const field = e.target;
    if (kind(field) !== 'number' || field.value) return;
    let cards = []; try { cards = await ipcRenderer.invoke('card:list'); } catch {}
    if (!cards.length || document.activeElement !== field) return;
    close();
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'closed' });
    const r = field.getBoundingClientRect();
    host.style.cssText = `position:fixed;left:${Math.round(r.left)}px;top:${Math.round(r.bottom + 4)}px;z-index:2147483647;`;
    shadow.innerHTML = `<style>
      .box{min-width:${Math.max(240, Math.round(r.width))}px;background:#fff;color:#191919;border:1px solid #E3DFD3;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.18);padding:6px;font:13.5px/1.3 system-ui,'Segoe UI',sans-serif}
      @media (prefers-color-scheme:dark){.box{background:#2B2A27;color:#ECE9E1;border-color:#3A3934}}
      .t{font-size:11.5px;color:#7A766A;padding:4px 8px 6px}
      button{all:unset;display:flex;align-items:center;gap:10px;width:calc(100% - 16px);padding:8px;border-radius:8px;cursor:pointer}
      button:hover,button:focus{background:rgba(217,119,87,.14)}
      .b{font-weight:700;min-width:84px}.e{margin-left:auto;color:#7A766A;font-size:12.5px}</style>
      <div class="box"><div class="t">Your saved cards · The Stupid Browser</div></div>`;
    const box = shadow.querySelector('.box');
    for (const c of cards) {
      const b = document.createElement('button');
      b.innerHTML = '<span class="b"></span><span class="n"></span><span class="e"></span>';
      b.querySelector('.b').textContent = c.brand; b.querySelector('.n').textContent = '•••• ' + c.last4; b.querySelector('.e').textContent = c.exp;
      b.addEventListener('mousedown', async (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        const d = await ipcRenderer.invoke('card:get', c.id).catch(() => null); close();
        if (!d) return;
        const f = fieldsNear(field);
        set(f.number || field, d.number); if (f.name) set(f.name, d.name);
        if (f.exp) set(f.exp, `${String(d.month).padStart(2, '0')}/${String(d.year).slice(-2)}`);
        if (f.month) set(f.month, String(d.month)); if (f.year) set(f.year, String(d.year));
        if (f.csc) f.csc.focus();   // the security code is never saved: type it yourself
      });
      box.appendChild(b);
    }
    document.documentElement.appendChild(host); picker = host;
    const away = () => { setTimeout(close, 150); field.removeEventListener('blur', away); };
    field.addEventListener('blur', away);
    field.addEventListener('input', close, { once: true });
  }, true);
  addEventListener('scroll', close, true);
}
