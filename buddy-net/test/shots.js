'use strict';
// Screenshot every era: SHOTS=/tmp/out xvfb-run -a npx electron --no-sandbox test/shots.js
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const out = process.env.SHOTS || path.join(__dirname, 'shots');
if (process.env.SHOT_PROXY) app.commandLine.appendSwitch('proxy-server', process.env.SHOT_PROXY);
if (process.env.SHOT_PROXY) app.commandLine.appendSwitch('ignore-certificate-errors');
app.setPath('userData', fs.mkdtempSync(path.join(require('os').tmpdir(), 'buddynet-')));
require('../main.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
app.on('browser-window-created', (_e, win) => {
  win.webContents.once('did-finish-load', async () => {
    fs.mkdirSync(out, { recursive: true });
    const run = (js) => win.webContents.executeJavaScript(js);
    const snap = async (name) => fs.writeFileSync(path.join(out, name + '.png'), (await win.capturePage()).toPNG());
    const page = process.env.SHOT_URL;
    for (const era of ['nineties', 'explorer', 'chrome', 'labs', 'ai']) {
      await run(`setEra('${era}', { animate: false });`);
      await wait(2500);
      await snap(`${era}-home`);
      if (page) {
        await run(`go(${JSON.stringify(page)})`);
        await wait(Number(process.env.SHOT_WAIT || 9000));
        if (era === 'labs') await run(`document.querySelector('[data-exp=filter]').click(); $('labs-panel').hidden = false;`);
        if (era === 'ai') { await run(`ask('Summarize this page')`); await wait(1500); }
        await snap(`${era}-page`);
        if (era === 'labs') await run(`document.querySelector('[data-exp=filter]').click(); $('labs-panel').hidden = true;`);
      }
    }
    const errs = await run('window.__errors || []');
    console.log('done', errs);
    app.quit();
  });
  win.webContents.on('console-message', (e) => { if (e.level === 'error' || e.level === 3) console.log('console:', e.message); });
});
