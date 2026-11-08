'use strict';
/* Buddy Net updates, told the way each era would have told you: a Windows 95 download dialog, an XP balloon and
   Windows Update, Chrome's wrench badge, a Windows 8 toast, or Buddy asking to update itself. */

const UPD_COPY = {
  nineties: {
    available: (v) => ({ title: 'Buddy Net Navigator Upgrade', text: `A new version of Buddy Net Navigator (v${v}) is available! Upgrade now and surf the Information Superhighway faster than ever.`, yes: 'Download Now', no: 'Later' }),
    downloading: (v, p) => ({ title: `Downloading BUDDYNET.EXE`, text: `Saving: BUDDYNET-${v}.EXE from buddynet.com`, eta: `Estimated time left: ${modemEta(p)} (at 28.8 Kbps)`, no: 'Hide' }),
    ready: (v) => ({ title: 'Setup', text: `Buddy Net Navigator ${v} is ready to install. Buddy Net must restart to finish.`, yes: 'Restart Now', no: 'Later' }),
    installing: () => ({ title: 'Setup', text: 'Installing Buddy Net Navigator. Please wait...' })
  },
  explorer: {
    available: (v) => ({ title: 'Updates are ready for your computer', text: `Click here to download Buddy Net Explorer ${v}.`, yes: 'Download', no: '' }),
    downloading: (v, p) => ({ title: 'Buddy Update', text: 'Downloading updates... (1 of 1)', eta: `${p}% complete`, no: 'Hide' }),
    ready: (v) => ({ title: 'Updates are ready to install', text: `Click here to restart and finish installing Buddy Net Explorer ${v}.`, yes: 'Restart Now', no: '' }),
    installing: () => ({ title: 'Buddy Update', text: 'Installing updates. Do not turn off your computer.' })
  },
  chrome: {
    available: (v) => ({ title: 'Update available', text: `Buddy Net Chrome ${v} is available.`, yes: 'Update Buddy Net', no: 'Not now' }),
    downloading: (v, p) => ({ title: 'Updating Buddy Net...', text: `Buddy Net Chrome ${v}`, eta: `${p}%`, no: 'Hide' }),
    ready: (v) => ({ title: 'Buddy Net is up to date', text: `Relaunch to finish updating to ${v}. Your tabs will reopen.`, yes: 'Relaunch now', no: 'Not now' }),
    installing: () => ({ title: 'Relaunching...', text: '' })
  },
  labs: {
    available: (v) => ({ title: 'Buddy Net Labs', text: `Version ${v} is ready to download. New experiments inside.`, yes: 'Download', no: 'Dismiss' }),
    downloading: (v, p) => ({ title: 'Buddy Net Labs', text: 'Downloading update', eta: `${p}%`, no: 'Hide' }),
    ready: (v) => ({ title: 'Buddy Net Labs', text: `Restart to finish updating to ${v}.`, yes: 'Restart', no: 'Later' }),
    installing: () => ({ title: 'Buddy Net Labs', text: 'Updating...' })
  },
  ai: {
    available: (v) => ({ title: `Buddy ${v} is out`, text: 'I learned some new tricks. Want me to update myself?', yes: 'Update me', no: 'Later' }),
    downloading: (v, p) => ({ title: 'Absorbing new knowledge…', text: `Buddy ${v}`, eta: `${p}%`, no: 'Hide' }),
    ready: (v) => ({ title: 'All set ✨', text: "Restart and I'll be a little smarter. Your tabs come back.", yes: 'Restart now', no: 'Later' }),
    installing: () => ({ title: 'Becoming smarter…', text: '' })
  }
};
// A 28.8k modem moved about 3.5 KB a second; a 100 MB browser would take the better part of a day.
function modemEta(p) {
  const mins = Math.round((100 - p) / 100 * 8 * 60);
  return mins >= 60 ? `${Math.floor(mins / 60)} hr ${mins % 60} min` : `${mins} min`;
}

let upd = { status: 'idle' };
const hidden = new Set();    // "status:version" pairs the user waved away

function renderUpdate() {
  const box = $('update');
  const era = state.era.id;
  const { status, version, progress = 0 } = upd;
  document.body.classList.toggle('update-badge', ['available', 'downloading', 'ready'].includes(status));
  updateSettingsLine();
  const make = UPD_COPY[era][status];
  if (!make || hidden.has(`${status}:${version}`)) { box.hidden = true; box.innerHTML = ''; return; }
  const c = make(version, progress);
  box.className = `upd upd-${status}`;
  box.innerHTML = '';
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };

  const head = el('div', 'upd-head');
  head.append(el('span', 'upd-icon'), el('span', 'upd-title', c.title));
  if (era === 'explorer' || era === 'nineties') {
    const x = el('button', 'upd-x', '×');
    x.title = 'Close';
    x.onclick = (e) => { e.stopPropagation(); dismiss(); };
    head.appendChild(x);
  }
  box.appendChild(head);
  const body = el('div', 'upd-body');
  if (status === 'downloading' && era === 'nineties') body.appendChild(el('div', 'upd-copy-anim', '')).append(el('i', 'folder a'), el('i', 'paper'), el('i', 'folder b'));
  if (c.text) body.appendChild(el('p', 'upd-text', c.text));
  if (status === 'downloading' || status === 'installing') {
    const bar = el('div', 'upd-bar');
    const fill = el('i');
    fill.style.width = `${status === 'installing' ? 100 : progress}%`;
    bar.appendChild(fill);
    if (era === 'ai') bar.style.setProperty('--p', progress);
    body.appendChild(bar);
  }
  if (c.eta) body.appendChild(el('p', 'upd-eta', c.eta));
  const btns = el('div', 'upd-btns');
  if (c.yes) { const b = el('button', 'upd-yes', c.yes); b.onclick = (e) => { e.stopPropagation(); act(); }; btns.appendChild(b); }
  if (c.no) { const b = el('button', 'upd-no', c.no); b.onclick = (e) => { e.stopPropagation(); dismiss(); }; btns.appendChild(b); }
  if (btns.childElementCount) body.appendChild(btns);
  box.appendChild(body);
  // The XP balloon itself is the button, as it was.
  box.onclick = era === 'explorer' && ['available', 'ready'].includes(status) ? act : null;
  box.hidden = false;
}

function act() {
  if (upd.status === 'available') window.buddy.downloadUpdate();
  else if (upd.status === 'ready') window.buddy.installUpdate();
}
function dismiss() { hidden.add(`${upd.status}:${upd.version}`); renderUpdate(); }

// The gear menu always shows the version and what the updater is up to.
function updateSettingsLine() {
  const line = $('upd-line'), btn = $('upd-check');
  if (!line) return;
  const v = upd.current ? `Buddy Net ${upd.current}` : 'Buddy Net';
  const say = {
    checking: 'checking for updates…', none: 'up to date', available: `version ${upd.version} is available`,
    downloading: `downloading ${upd.version} (${upd.progress || 0}%)`, ready: `${upd.version} is ready, restart to finish`,
    installing: 'installing…', error: `update failed: ${upd.error || 'unknown error'}`,
    manual: "this copy can't update itself", dev: 'running from source, updates are off'
  }[upd.status] || '';
  line.textContent = say ? `${v}, ${say}` : v;
  btn.textContent = upd.status === 'available' ? 'Download' : upd.status === 'ready' ? 'Restart' : upd.status === 'manual' ? 'Get the latest' : 'Check for updates';
  btn.disabled = ['checking', 'downloading', 'installing', 'dev'].includes(upd.status);
}

function startUpdateUI() {
  $('upd-check').onclick = async () => {
    if (upd.status === 'available' || upd.status === 'ready') { hidden.clear(); act(); return; }
    if (upd.status === 'manual') { window.buddy.openExternal(upd.page); return; }
    hidden.clear();
    upd = await window.buddy.checkUpdate();
    renderUpdate();
  };
  window.buddy.onUpdate((st) => { upd = st; renderUpdate(); });
  window.buddy.updateState().then((st) => { upd = st; renderUpdate(); });
}
startUpdateUI();
