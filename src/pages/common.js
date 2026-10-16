'use strict';
/* Shared helpers for stupid:// pages */
const S = window.stupid || { invoke: () => Promise.reject(new Error('no bridge')), on: () => {} };
const call = (ch, ...a) => S.invoke(ch, ...a);
const $ = (id) => document.getElementById(id);
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function icon(inner) { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.innerHTML = inner; return s; }
const ACCENTS = { clay: '#D97757', sand: '#C9963F', sage: '#6F9161', sky: '#5B87B5', plum: '#9A6390', rose: '#C8606F', ink: '#5A5548' };
function applyAccent(s) { const c = ACCENTS[s && s.accent] || ACCENTS.clay; document.documentElement.style.setProperty('--accent', c); document.documentElement.style.setProperty('--accent-soft', c + '24'); }
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const favFor = (u) => { const h = hostOf(u); return h ? `https://www.google.com/s2/favicons?sz=64&domain=${h}` : ''; };
function favImg(u) { const i = el('img', 'fav'); i.src = favFor(u); i.onerror = () => { i.style.visibility = 'hidden'; }; return i; }
let toastT;
function toast(msg) { let t = document.querySelector('.toast'); if (!t) { t = el('div', 'toast'); document.body.appendChild(t); } t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 2200); }
const fmtBytes = (n) => (n > 1e9 ? (n / 1e9).toFixed(1) + ' GB' : n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : n > 1e3 ? Math.round(n / 1e3) + ' KB' : (n || 0) + ' B');
const SEARCH_ICON = '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>';
const X_ICON = '<path d="M6 6l12 12M18 6L6 18"/>';
call('settings:get').then(applyAccent).catch(() => {});
S.on('settings:changed', applyAccent);
