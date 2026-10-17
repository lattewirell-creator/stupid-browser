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
  const check = () => { if (!filled && document.querySelector('input[type="password"]')) tryFill(); };
  const start = () => {
    check();
    for (const ms of [400, 1500, 4000, 10000]) setTimeout(check, ms);
    document.addEventListener('focusin', (e) => { if (!filled && e.target && e.target.tagName === 'INPUT') check(); }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
}
