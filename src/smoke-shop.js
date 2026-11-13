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
    if (q('#accessory-grid').children.length !== BuddyWardrobe.catalog.filter(item => !item.retired).length + 1) throw new Error('Shop catalog is incomplete');
    const prices = [...q('#accessory-grid').children].map(card => Number(card.querySelector('small').textContent.split(' ')[0]));
    if (prices.some((price, index) => index && price < prices[index - 1])) throw new Error('Shop must sort by increasing price');
    if (!q('#next-milestone').textContent.includes('+1 coin bonus')) throw new Error('Next milestone is missing');
    q('[data-item="daisy-crown"]').click();
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
    if ((await window.buddy.getState()).collection.coins !== 1) throw new Error('Shop charged incorrect prices');
    await window.buddy.buyAccessory('daisy-crown');
    if ((await window.buddy.getState()).collection.coins !== 1) throw new Error('Duplicate purchase charged again');
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
  const original = store.snapshot();
  const { localDay, shiftDay, summary } = require('./renderer/domain');
  const today = localDay(new Date(), original.settings.dayStartHour);
  const fixture = store.snapshot(); fixture.collection.coins = 200; store.commit(fixture); broadcast();
  showPopup();
  await popup.webContents.executeJavaScript(`(() => {
    document.querySelector('#shop-toggle').click(); document.querySelector('[data-category="buddies"]').click();
    if (document.querySelectorAll('#accessory-grid [data-item]').length !== 3) throw new Error('Buddies category needs three characters');
    document.querySelector('[data-item="buddy-mushroom"]').click();
    if (!document.querySelector('#collection-preview .mushroom')) throw new Error('Buddy preview missing');
  })()`);
  if (store.snapshot().settings.avatar === 'mushroom') throw new Error('Preview must not change the real buddy');
  const beforeBuddies = store.snapshot();
  for (const type of ['mushroom', 'cloud', 'strawberry']) {
    await popup.webContents.executeJavaScript(`(async () => {
      document.querySelector('[data-item="buddy-${type}"]').click(); document.querySelector('#collection-action').click();
      const deadline = Date.now() + 5000;
      while (busy || (await window.buddy.getState()).settings.avatar !== '${type}') {
        if (Date.now() > deadline) throw new Error('Buddy unlock timed out');
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      if (document.querySelector('#collection-action').textContent !== 'Your current buddy') throw new Error('Owned buddy action incorrect');
    })()`);
    await new Promise(resolve => setTimeout(resolve, 120));
    if (!await avatar.webContents.executeJavaScript(`getComputedStyle(document.querySelector('#character .${type}')).display !== 'none' && document.querySelectorAll('#character [data-accessory]').length === 4`)) throw new Error('New buddy and outfit must render together');
    fs.writeFileSync(path.join(captureDir, `${type}-buddy-preview.png`), (await popup.webContents.capturePage()).toPNG());
  }
  if (store.snapshot().collection.coins !== beforeBuddies.collection.coins - 53) throw new Error('Buddy unlock prices incorrect');
  if (JSON.stringify(store.snapshot().days) !== JSON.stringify(beforeBuddies.days)) throw new Error('Changing buddies must preserve progress');
  await popup.webContents.executeJavaScript("document.querySelector('#back-home').click();document.querySelector('#settings-toggle').click()");
  if (!await popup.webContents.executeJavaScript("document.querySelector('#avatar-choice').options.length === 6")) throw new Error('Unlocked buddies must appear in Settings');
  await popup.webContents.executeJavaScript("document.querySelector('#back-home').click()");
  await popup.webContents.executeJavaScript(`(() => {
    const q = selector => document.querySelector(selector);
    q('#shop-toggle').click(); q('[data-category="accessories"]').click();
    if (!q('[data-item="round-glasses"]') || !q('[data-item="round-glasses"]').textContent.includes('Yours')) throw new Error('Owned glasses must remain visible in the shop');
    if (q('[data-category="companions"]') || q('[data-item="garden-sprout"]') || q('#wardrobe-slots').children.length !== 4) throw new Error('Companions must be removed from the shop and wardrobe');
    if (BuddyWardrobe.catalog.find(item => item.id === 'berry-beret').price !== 7) throw new Error('Berry beret must cost seven coins');
  })()`);
  for (const id of ['round-glasses', 'mushroom-cap', 'strawberry-bonnet', 'moon-crown']) {
    await popup.webContents.executeJavaScript(`document.querySelector('[data-item="${id}"]').click()`);
    if (!await popup.webContents.executeJavaScript(`!!document.querySelector('#collection-preview [data-accessory="${id}"]')`)) throw new Error('Accessory preview missing: ' + id);
    await new Promise(resolve => setTimeout(resolve, 180));
    fs.writeFileSync(path.join(captureDir, `${id}-preview.png`), (await popup.webContents.capturePage()).toPNG());
  }
  const habit = store.addHabit({ name: 'Repair check', type: 'checkbox' });
  const repairFixture = store.snapshot();
  repairFixture.habits = [habit];
  repairFixture.days = Object.fromEntries([-5, -4, -3].map(offset => [shiftDay(today, offset), [{ ...habit, amount: 1 }]]));
  Object.assign(repairFixture.collection, { coins: 10, repairs: [], earnings: [], rewardedDays: [-5, -4, -3].map(offset => shiftDay(today, offset)), milestones: [`${shiftDay(today, -5)}:3`] });
  store.commit(repairFixture); broadcast();
  await popup.webContents.executeJavaScript(`(async () => {
    const q = selector => document.querySelector(selector);
    q('#shop-toggle').click(); q('[data-category="streak"]').click();
    if (q('#accessory-grid').children.length !== 1 || !q('#try-on-caption').textContent.includes('Restore your 3-day streak for 6 coins') || q('#collection-action').disabled) throw new Error('Repair must explain the exact result and price');
  })()`);
  await new Promise(resolve => setTimeout(resolve, 180));
  fs.writeFileSync(path.join(captureDir, 'repair-preview.png'), (await popup.webContents.capturePage()).toPNG());
  await popup.webContents.executeJavaScript(`(async () => {
    document.querySelector('#collection-action').click();
    const deadline = Date.now() + 5000;
    while (!(await window.buddy.getState()).collection.repairs.length || busy) {
      if (Date.now() > deadline) throw new Error('Repair purchase timed out');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    if (!document.querySelector('#collection-action').disabled) throw new Error('A restored streak cannot buy a duplicate repair');
    if (!document.querySelector('#try-on-caption').textContent.includes('Used this month · Available again') || document.querySelector('#collection-action').textContent !== 'Used this month') throw new Error('Monthly repair use must show the next available date');
  })()`);
  if (store.snapshot().collection.coins !== 4 || summary(store.snapshot()).current !== 3 || store.snapshot().days[shiftDay(today, -1)]) throw new Error('Repair must restore the streak without rewards or fabricated progress');
  store.commit(original); broadcast(); popup.hide();
  console.log('TIER SHOP CHECK PASSED: price sorting, filters, owned glasses, redesigned accessories, and monthly six-coin streak repair.');
  console.log('SHOP UI CHECK PASSED: accessory previews, permanent buddy unlocks, six-buddy picker, outfit compatibility, prices and persistence.');
}
module.exports = { runShopSmoke };
