'use strict';
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { UpdateManager } = require('./updates');

async function runUpdateSmoke({ popup, showPopup, original, replace, publish, captureDir }) {
  const fake = new EventEmitter();
  let response = 'missing', finishDownload, saved = false, installed = false;
  fake.checkForUpdates = async () => {
    if (response === 'missing') throw Object.assign(new Error('No published versions on GitHub'), { code: 'ERR_XML_MISSED_ELEMENT' });
    if (response === 'offline') throw new Error('ECONNRESET');
    fake.emit('update-available', { version: '999.0.0' }); return {};
  };
  fake.downloadUpdate = () => new Promise(resolve => {
    fake.emit('download-progress', { percent: 50 });
    finishDownload = () => { fake.emit('update-downloaded', { version: '999.0.0' }); resolve([]); };
  });
  fake.quitAndInstall = (silent, restart) => { if (!saved || !silent || !restart) throw new Error('Save before restarting'); installed = true; };
  const manager = new UpdateManager({ updater: fake, version: original.snapshot().currentVersion, onChange: publish, beforeInstall: () => { saved = true; } });
  const read = expression => popup.webContents.executeJavaScript(expression);
  const wait = async expression => {
    const deadline = Date.now() + 4000;
    while (!await read(expression)) {
      if (Date.now() > deadline) throw new Error('Update UI did not reach: ' + expression);
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  };
  try {
    replace(manager); publish(manager.snapshot()); showPopup();
    await read("document.querySelector('#settings-toggle').click()");
    await read("document.querySelector('#update-action').click()");
    await wait("document.querySelector('#update-status').textContent.includes('No published updates')");
    response = 'offline';
    await read("document.querySelector('#update-action').click()");
    await wait("document.querySelector('#update-status').textContent.includes('connection')");
    response = 'available';
    await read("document.querySelector('#update-action').click()");
    await wait("document.querySelector('#update-action').textContent === 'Download update'");
    if (!await read("document.querySelector('#settings-toggle').classList.contains('update-available')")) throw new Error('Update availability needs a quiet settings badge');
    await read("document.querySelector('#update-later').click()");
    await wait("!document.querySelector('#settings-toggle').classList.contains('update-available')");
    await read("document.querySelector('#update-action').click()");
    await wait("document.querySelector('#update-status').textContent.includes('50%') && document.querySelector('#update-action').disabled");
    finishDownload();
    await wait("document.querySelector('#update-action').textContent === 'Update and restart' && !document.querySelector('#update-action').disabled");
    fs.writeFileSync(path.join(captureDir, 'update-preview.png'), (await popup.webContents.capturePage()).toPNG());
    if (installed) throw new Error('A downloaded update must wait for the user');
    await read("document.querySelector('#update-action').click()");
    if (!saved || !installed) throw new Error('Update and restart must explicitly save and request installation');
    console.log('UPDATE UI CHECK PASSED: no releases, offline retry, availability, Later, progress, and explicit restart.');
  } finally {
    manager.dispose(); replace(original); publish(original.snapshot());
    await read("document.querySelector('#back-home').click()");
  }
}
module.exports = { runUpdateSmoke };
