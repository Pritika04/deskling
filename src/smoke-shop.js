'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { Store } = require('./store');
async function runShopSmoke({ avatar, popup, store, closeReward, hideEffects, broadcast, showPopup }, captureDir) {
  closeReward(false); hideEffects();
  await new Promise(resolve => setTimeout(resolve, 120));
  const shopFixture = store.snapshot(); shopFixture.collection.coins = 40; store.commit(shopFixture); broadcast();
  showPopup();
  await popup.webContents.executeJavaScript("document.querySelector('#settings-toggle').click()");
  await new Promise(resolve => setTimeout(resolve, 120));
  const aligned = await popup.webContents.executeJavaScript("(() => { const input = document.querySelector('#rename-buddy').getBoundingClientRect(), button = document.querySelector('#rename-form button').getBoundingClientRect(); return Math.abs(input.top - button.top) < 1 && Math.abs(input.bottom - button.bottom) < 1; })()");
  if (!aligned) throw new Error('Save name must align with the name field');
  fs.writeFileSync(path.join(captureDir, 'settings-preview.png'), (await popup.webContents.capturePage()).toPNG());
  await popup.webContents.executeJavaScript("document.querySelector('#back-home').click()");
  await popup.webContents.executeJavaScript(`(async () => {
    const q = selector => document.querySelector(selector);
    const waitFor = async predicate => {
      const deadline = Date.now() + 5000;
      while (!await predicate()) {
        if (Date.now() > deadline) throw new Error('Shop UI check timed out');
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    };
    q('#shop-toggle').click();
    if (q('#collection').hidden || !q('#today').hidden || !q('#history').hidden || !q('#settings').hidden) throw new Error('Shop must be its own view');
    if (q('#accessory-grid').children.length !== BuddyWardrobe.catalog.length) throw new Error('Shop catalog is incomplete');
    if (!q('#collection-preview [data-accessory="daisy-crown"]')) throw new Error('Try-on preview is missing');
  })()`);
  if (await avatar.webContents.executeJavaScript("document.querySelectorAll('#character [data-accessory]').length") !== 0) throw new Error('Trying on an unowned item must not dress the desktop buddy');
  if (!popup.isVisible()) throw new Error('Shop must remain visible after opening');
  await new Promise(resolve => setTimeout(resolve, 180));
  fs.writeFileSync(path.join(captureDir, 'shop-preview.png'), (await popup.webContents.capturePage()).toPNG());
  await popup.webContents.executeJavaScript(`(async () => {
    const q = selector => document.querySelector(selector);
    const waitFor = async predicate => {
      const deadline = Date.now() + 5000;
      while (!await predicate()) { if (Date.now() > deadline) throw new Error('Purchase did not finish'); await new Promise(resolve => setTimeout(resolve, 25)); }
    };
    for (const id of ['daisy-crown', 'round-glasses', 'cozy-scarf', 'rainy-umbrella']) {
      q('[data-item="' + id + '"]').click();
      if (q('#collection-action').disabled) throw new Error('Affordable item must be purchasable');
      q('#collection-action').click();
      await waitFor(async () => (await window.buddy.getState()).collection.owned.includes(id) && !busy);
    }
    if ((await window.buddy.getState()).collection.coins !== 22) throw new Error('Shop charged incorrect prices');
    await window.buddy.buyAccessory('daisy-crown');
    if ((await window.buddy.getState()).collection.coins !== 22) throw new Error('Duplicate purchase charged again');
    q('#wardrobe-tab').click();
    q('#accessory-grid button:not([data-item])').click();
    q('#collection-action').click();
    await waitFor(async () => !(await window.buddy.getState()).collection.equipped.hat && !busy);
    q('[data-item="daisy-crown"]').click();
    if ((await window.buddy.getState()).collection.equipped.hat !== null) throw new Error('Wardrobe preview must wait for Wear this outfit');
    q('#collection-action').click();
    await waitFor(async () => (await window.buddy.getState()).collection.equipped.hat === 'daisy-crown' && !busy);
  })()`);
  for (const avatarType of ['plant', 'pineapple', 'star']) {
    await popup.webContents.executeJavaScript(`window.buddy.updateSettings({ avatar: '${avatarType}' })`);
    if (await avatar.webContents.executeJavaScript("document.querySelectorAll('#character [data-accessory]').length") !== 4) throw new Error('All four accessory slots must appear on every buddy');
  }
  await new Promise(resolve => setTimeout(resolve, 150));
  fs.writeFileSync(path.join(captureDir, 'wardrobe-preview.png'), (await popup.webContents.capturePage()).toPNG());
  if (JSON.stringify(new Store(store.filePath).snapshot().collection) !== JSON.stringify(store.snapshot().collection)) throw new Error('Coins and outfits must survive restart');
  popup.hide(); avatar.webContents.send('avatar:reaction', { state: 'idle' });
  await new Promise(resolve => setTimeout(resolve, 120));
  fs.writeFileSync(path.join(captureDir, 'outfit-preview.png'), (await avatar.webContents.capturePage()).toPNG());
  console.log('SHOP UI CHECK PASSED: previews, purchases, wardrobe combinations on all three buddies, and persistence.');
}
module.exports = { runShopSmoke };
