'use strict';
// Buddy Net: a time-travelling browser. The window chrome changes per era, and old eras
// load pages from the Wayback Machine so the web itself looks like it did back then.
const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

app.setName('Buddy Net');

const SETTINGS_FILE = () => path.join(app.getPath('userData'), 'buddy-net.json');
const DEFAULTS = { era: '1996', timeTravel: true, sounds: true, apiKey: '' };

function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE(), 'utf8')) }; }
  catch { return { ...DEFAULTS }; }
}
function saveSettings(s) {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE()), { recursive: true });
    fs.writeFileSync(SETTINGS_FILE(), JSON.stringify(s, null, 2));
  } catch (err) { console.error('settings save failed', err); }
}
let settings;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200, height: 820, minWidth: 720, minHeight: 480,
    frame: false, backgroundColor: '#c0c0c0', title: 'Buddy Net',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: true
    }
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  const sendMax = () => win.webContents.send('win:maximized', win.isMaximized());
  win.on('maximize', sendMax);
  win.on('unmaximize', sendMax);
  return win;
}

// Pages in the <webview> get no node, no preload, and pop-ups open as tabs instead of windows.
app.on('web-contents-created', (_e, wc) => {
  wc.on('will-attach-webview', (_ev, prefs) => {
    delete prefs.preload;
    prefs.nodeIntegration = false;
    prefs.contextIsolation = true;
    prefs.sandbox = true;
  });
  if (wc.getType() === 'webview') {
    wc.setWindowOpenHandler(({ url }) => {
      const host = wc.hostWebContents;
      if (host && /^https?:/.test(url)) host.send('tab:open', url);
      return { action: 'deny' };
    });
  }
});

const fromWindow = (e) => BrowserWindow.fromWebContents(e.sender);
ipcMain.on('win:minimize', (e) => fromWindow(e)?.minimize());
ipcMain.on('win:maximize', (e) => {
  const w = fromWindow(e);
  if (w) w.isMaximized() ? w.unmaximize() : w.maximize();
});
ipcMain.on('win:close', (e) => fromWindow(e)?.close());
ipcMain.on('open-external', (_e, url) => { if (/^https?:/.test(url)) shell.openExternal(url); });

ipcMain.handle('settings:get', () => ({ ...settings, apiKey: '', hasKey: !!(settings.apiKey || process.env.ANTHROPIC_API_KEY) }));
ipcMain.handle('settings:set', (_e, patch) => {
  for (const k of Object.keys(DEFAULTS)) if (k in patch) settings[k] = patch[k];
  saveSettings(settings);
  return true;
});

// The 2020s era's AI. With an Anthropic key it asks Claude; without one, main returns null
// and the UI falls back to its own offline "AI" so the era still works out of the box.
ipcMain.handle('ai:ask', async (_e, { question, page }) => {
  const key = settings.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const context = page ? `The user is looking at "${page.title}" (${page.url}). Page text:\n${String(page.text).slice(0, 12000)}` : '';
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-opus-5-5',
        max_tokens: 700,
        system: 'You are Buddy, the AI built into the Buddy Net browser. Answer briefly and warmly in plain text.',
        messages: [{ role: 'user', content: `${context}\n\n${question}`.trim() }]
      })
    });
    const data = await res.json();
    if (!res.ok) return { error: data?.error?.message || `HTTP ${res.status}` };
    return { text: (data.content || []).map((c) => c.text || '').join('').trim() };
  } catch (err) {
    return { error: err.message };
  }
});

app.whenReady().then(() => {
  settings = loadSettings();
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
