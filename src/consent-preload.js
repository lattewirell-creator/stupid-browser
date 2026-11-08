'use strict';
// Runs in web pages (isolated world). Cookie pop-ups: says no for you. It only ever clicks a "Reject all" /
// "Only necessary" style button, never "Accept", and only inside something that is clearly a cookie notice.
// Looks a few times while the page settles (no MutationObserver: watching every change slows busy pages down).
const { ipcRenderer } = require('electron');
// Sign-in and permission pages ("Allow this app?") are never touched.
const AUTH_PAGE = /oauth|authori[sz]e|consent|login|signin|sign-in|sso|account/i;
const GOOGLE_CONSENT = /^consent\.(google|youtube)\./;   // Google's own cookie page, which is what it sounds like
if (/^https?:$/.test(location.protocol) && window.top === window && (GOOGLE_CONSENT.test(location.hostname) || !AUTH_PAGE.test(location.pathname + ' ' + location.hostname.split('.')[0]))) {
  // Buttons of the common consent tools that mean "no". (Tools that draw their notice in an iframe, like
  // Sourcepoint, aren't reached: this only runs in the page itself.)
  const KNOWN = [
    '#onetrust-reject-all-handler', '.ot-pc-refuse-all-handler',
    '#CybotCookiebotDialogBodyButtonDecline', '#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll',
    '#didomi-notice-disagree-button', '.didomi-continue-without-agreeing',
    '#truste-consent-required', '.cky-btn-reject', '.cmplz-deny', '.cm-btn-decline', '.cn-decline',
    '.iubenda-cs-reject-btn', '#axeptio_btn_dismiss', '.osano-cm-denyAll', '[data-tid="banner-decline"]',
    '.fc-cta-do-not-consent', '#cookiescript_reject', '[data-cookiefirst-action="reject"]',
    '#tarteaucitronAllDenied2', '[data-testid="uc-deny-all-button"]'
  ];
  const words = (list) => new RegExp('^(?:' + list.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')$', 'i');
  // Clear "no to cookies" buttons: fine in any notice that's about cookies.
  const NO = words([
    'reject all', 'reject all cookies', 'reject cookies', 'reject optional cookies', 'reject non-essential cookies', 'reject additional cookies',
    'decline all', 'decline cookies', 'decline optional cookies', 'decline all cookies', 'deny all', 'deny cookies', 'refuse all', 'refuse cookies',
    'only necessary', 'only necessary cookies', 'necessary only', 'necessary cookies only', 'use necessary cookies only', 'use only necessary cookies',
    'allow necessary cookies only', 'allow only necessary cookies', 'only essential', 'only essential cookies', 'essential only', 'essential cookies only',
    'accept only necessary', 'accept only necessary cookies', 'accept only essential', 'accept only essential cookies', 'accept necessary cookies',
    'continue without accepting', 'continue without agreeing',
    'avvisa alla', 'avvisa alla cookies', 'avvisa cookies', 'avböj alla', 'avböj cookies', 'neka alla', 'neka alla cookies', 'neka cookies',
    'endast nödvändiga', 'endast nödvändiga cookies', 'endast nödvändiga kakor', 'bara nödvändiga', 'bara nödvändiga cookies',
    'tillåt endast nödvändiga', 'tillåt endast nödvändiga cookies', 'godkänn endast nödvändiga', 'godkänn endast nödvändiga cookies',
    'acceptera endast nödvändiga', 'acceptera endast nödvändiga cookies', 'använd endast nödvändiga cookies', 'fortsätt utan att godkänna',
    'alle ablehnen', 'nur notwendige', 'nur notwendige cookies', 'nur erforderliche cookies', 'tout refuser', 'refuser tout',
    'continuer sans accepter', 'rechazar todo', 'rechazar todas', 'rifiuta tutto', 'alles weigeren', 'alle weigeren',
    'afvis alle', 'avvis alle', 'hylkää kaikki', 'odrzuć wszystkie'
  ]);
  // Bare "Reject" / "Decline": only in something that names itself a cookie notice.
  const NO_BARE = words(['reject', 'decline', 'deny', 'refuse', 'avvisa', 'avböj', 'neka', 'ablehnen', 'refuser', 'rechazar', 'rifiuta', 'weigeren', 'afvis', 'avvis', 'hylkää', 'odrzuć']);
  // A real cookie notice also offers the opposite.
  const YES = /^(?:accept|accept all|accept all cookies|accept cookies|allow all|allow all cookies|allow cookies|agree|i agree|agree and close|agree & close|ok|got it|godkänn|godkänn alla|godkänn alla cookies|acceptera|acceptera alla|acceptera alla cookies|tillåt alla|tillåt alla cookies|jag godkänner|alle akzeptieren|akzeptieren|tout accepter|accepter|aceptar|aceptar todo|accetta|accetta tutto|alles accepteren|accepteren|accepter alle|godta alle|hyväksy kaikki|zaakceptuj wszystkie)$/i;
  const NOTICE = '[id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i], [id*="gdpr" i], [class*="gdpr" i], [aria-label*="cookie" i], [aria-label*="consent" i], [role="dialog"], [aria-modal="true"], dialog';
  const NAMED = /cookie|kakor|gdpr|consent-?(?:banner|bar|modal|popup|notice|dialog|layer|wall)/i;   // the box's own name says so
  const TEXT_COOKIES = /\bcookies?\b|\bkakor\b/i;
  const BUTTONS = 'button, a[role="button"], [role="button"], input[type="button"], input[type="submit"]';
  const shown = (el) => !!(el && el.getClientRects().length) && getComputedStyle(el).visibility !== 'hidden';
  const label = (b) => (b.innerText || b.value || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().replace(/[.!→›»]+$/, '').trim();
  function findNo(root) {
    for (const sel of KNOWN) { const b = root.querySelector(sel); if (shown(b)) return b; }
    const looked = [];
    for (const box of root.querySelectorAll(NOTICE)) {
      // A notice is small: skip the page itself, big containers (a site's own app), boxes inside one already
      // looked at, and anything with a login form.
      if (box === document.body || box === document.documentElement || looked.some((l) => l.contains(box))) continue;
      if ((box.textContent || '').length > 8000 || !shown(box) || box.querySelector('input[type="password"], main, article')) continue;
      looked.push(box);
      const named = NAMED.test((box.id || '') + ' ' + (typeof box.className === 'string' ? box.className : '') + ' ' + (box.getAttribute('aria-label') || ''));
      if (!named && !TEXT_COOKIES.test((box.innerText || '').slice(0, 3000))) continue;
      let no = null, yes = false;
      for (const b of box.querySelectorAll(BUTTONS)) {
        if (!shown(b)) continue;
        const t = label(b); if (!t || t.length > 48) continue;
        if (YES.test(t)) yes = true;
        else if (!no && (NO.test(t) || (named && NO_BARE.test(t)))) no = b;
      }
      if (no && yes) return no;
    }
    // Usercentrics and friends draw their notice inside a shadow root.
    for (const host of root.querySelectorAll('#usercentrics-root, #usercentrics-cmp-ui, [id^="cmpwrapper"]')) {
      if (host.shadowRoot) { const b = findNo(host.shadowRoot); if (b) return b; }
    }
    return null;
  }
  let done = false, on = null;
  // A notice shows up early: look for 30 seconds after the page is first shown, then stop.
  let until = document.hidden ? Infinity : Date.now() + 30000;
  async function check() {
    if (done || Date.now() > until) return;
    if (on === null) { try { on = await ipcRenderer.invoke('consent:on'); } catch { on = false; } }
    if (!on || !document.body) return;
    const b = findNo(document);
    if (!b) return;
    done = true;
    b.click();
    ipcRenderer.send('consent:declined');
  }
  // Background tabs have no layout, so a notice there can't be found yet: look again when the tab is shown
  // (within the first 30 seconds of the page).
  const start = () => {
    check(); for (const ms of [600, 1500, 3000, 5500, 9000]) setTimeout(check, ms);
    const onShow = () => { if (!document.hidden && until === Infinity) until = Date.now() + 30000; if (done || Date.now() > until) { document.removeEventListener('visibilitychange', onShow); return; } if (!document.hidden) { check(); setTimeout(check, 800); } };
    document.addEventListener('visibilitychange', onShow);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
}
