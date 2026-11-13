'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../src/store');
const { catalog, shopItems } = require('../src/renderer/wardrobe');
const { coinEarnings, summary, nextMilestone, graceNotice } = require('../src/renderer/domain');
function setup(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'buddy-collection-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'state.json');
  let now = new Date(2026, 10, 1, 12);
  const options = { now: () => now };
  const store = new Store(file, options);
  const day = value => { now = new Date(2026, 10, value, 12); };
  const progress = () => summary(store.snapshot(), now);
  return { store, file, reopen: () => new Store(file, options), day, progress, now: () => now };
}
test('daily coins have no monthly grant or duplicates from edits, added habits, gifts and restarts', t => {
  const { store, day, reopen } = setup(t);
  store.nameBuddy('Miso'); assert.equal(store.snapshot().collection.coins, 0);
  const read = store.addHabit({ name: 'Read', type: 'minutes', goal: 15 });
  store.logProgress(read.id, 7); assert.equal(store.snapshot().collection.coins, 0);
  store.logProgress(read.id, 15, { replace: true });
  store.logProgress(read.id, 10, { replace: true }); store.logProgress(read.id, 15, { replace: true });
  store.openMystery(); const water = store.addHabit({ name: 'Water', type: 'checkbox' });
  store.logProgress(water.id, 1); store.openMystery(); store.archiveHabit(water.id);
  const next = reopen(); next.refreshRewards(); next.nameBuddy('Pip');
  assert.equal(next.snapshot().collection.coins, 1);
  assert.deepEqual(next.snapshot().collection.rewardedDays, ['2026-11-01']);
  day(31); store.refreshRewards(); assert.equal(store.snapshot().collection.coins, 1);
});
test('the exact tier table and recurring fifty-day rewards persist without duplicate payouts', t => {
  const { store, day, reopen, now } = setup(t);
  store.nameBuddy('Pip'); const habit = store.addHabit({ name: 'Walk', type: 'checkbox' });
  const totals = new Map([[3, 4], [5, 8], [10, 17], [30, 52], [50, 102], [100, 202], [150, 302]]);
  for (let index = 1; index <= 150; index++) {
    day(index); store.logProgress(habit.id, 1);
    if (totals.has(index)) assert.equal(store.snapshot().collection.coins, totals.get(index), `day ${index}`);
    assert.equal(store.refreshRewards(), null);
  }
  assert.equal(store.snapshot().collection.milestones.length, 7);
  const reopened = reopen(); reopened.refreshRewards();
  assert.equal(reopened.snapshot().collection.coins, 302);
  assert.deepEqual(coinEarnings(reopened.snapshot(), now()).map(item => item.coins), [1, 50]);
  assert.deepEqual(nextMilestone(150), { days: 200, remaining: 50, coins: 50 });
});
test('one missed day freezes, resuming counts completed days only, and two missed days reset', t => {
  const { store, day, progress, now, reopen } = setup(t);
  store.nameBuddy('Miso'); const habit = store.addHabit({ name: 'Rest', type: 'checkbox' });
  day(1); store.logProgress(habit.id, 1); day(2); store.logProgress(habit.id, 1);
  day(4); store.refreshRewards();
  assert.equal(progress().current, 2); assert.equal(progress().frozen, true);
  assert.equal(progress().graceDay, '2026-11-03'); assert.equal(store.snapshot().collection.coins, 2);
  assert.equal(graceNotice(store.snapshot(), now()).day, '2026-11-03');
  store.markGraceNotice(progress().graceDay); store.markGraceNotice(progress().graceDay);
  assert.deepEqual(store.snapshot().collection.graceNotices, ['2026-11-03']);
  assert.equal(graceNotice(reopen().snapshot(), now()), null);
  store.logProgress(habit.id, 1);
  assert.equal(progress().current, 3); assert.equal(progress().frozen, false);
  assert.equal(store.snapshot().collection.coins, 4);
  day(7); assert.equal(progress().current, 0); assert.equal(progress().repair.count, 3);
  store.logProgress(habit.id, 1); day(8); store.logProgress(habit.id, 1); day(9); store.logProgress(habit.id, 1);
  assert.equal(progress().current, 3); assert.equal(store.snapshot().collection.coins, 8);
});
test('a six-coin repair restores the original run without paying missed days or milestones twice', t => {
  const { store, day, progress, reopen } = setup(t);
  store.nameBuddy('Miso'); const habit = store.addHabit({ name: 'Read', type: 'checkbox' });
  for (let index = 1; index <= 10; index++) { day(index); store.logProgress(habit.id, 1); }
  day(13); assert.equal(progress().current, 0); assert.equal(progress().repair.count, 10);
  store.buyAccessory('streak-repair');
  assert.equal(progress().current, 10); assert.equal(store.snapshot().collection.coins, 11);
  const before = store.snapshot(); assert.throws(() => store.buyAccessory('streak-repair'));
  assert.deepEqual(store.snapshot(), before);
  store.logProgress(habit.id, 1); assert.equal(progress().current, 11);
  assert.equal(store.snapshot().collection.coins, 12);
  assert.equal(reopen().snapshot().collection.coins, 12);
  assert.equal(store.snapshot().days['2026-11-11'], undefined);
  day(16); assert.equal(progress().current, 0); assert.equal(progress().repair, null);
  assert.equal(progress().repairAllowance.used, true);
});
test('repairs require a recent broken streak and sufficient coins', t => {
  const { store, day, progress } = setup(t);
  store.nameBuddy('Pip'); const habit = store.addHabit({ name: 'Walk', type: 'checkbox' }); store.logProgress(habit.id, 1);
  assert.throws(() => store.repairStreak());
  day(4); const before = store.snapshot(); assert.ok(progress().repair);
  assert.throws(() => store.repairStreak()); assert.deepEqual(store.snapshot(), before);
  day(9); assert.ok(progress().repair); day(10); assert.equal(progress().repair, null);
  assert.throws(() => store.repairStreak());
});
test('a second break in the same month cannot buy a repair, including after restart', t => {
  const { store, day, reopen, file, progress } = setup(t);
  store.nameBuddy('Miso'); const habit = store.addHabit({ name: 'Read', type: 'checkbox' });
  for (let index = 1; index <= 10; index++) { day(index); store.logProgress(habit.id, 1); }
  day(13); store.repairStreak(); store.logProgress(habit.id, 1);
  day(16); const next = reopen(), before = next.snapshot(), bytes = fs.readFileSync(file, 'utf8');
  assert.equal(progress().repair, null);
  assert.deepEqual(progress().repairAllowance, { used: true, nextAvailable: '2026-12-01' });
  assert.throws(() => next.buyAccessory('streak-repair'), /already used/);
  assert.deepEqual(next.snapshot(), before); assert.equal(fs.readFileSync(file, 'utf8'), bytes);
  // One-off grace days still protect subsequent streaks after a repair is used.
  store.logProgress(habit.id, 1); day(18);
  assert.equal(progress().frozen, true); assert.equal(progress().current, 1);
});
test('calendar-month reset permits one recent repair without banking unused months or reviving expired breaks', t => {
  const { store, day, progress, reopen } = setup(t);
  store.nameBuddy('Pip'); const habit = store.addHabit({ name: 'Walk', type: 'checkbox' });
  for (let index = 1; index <= 10; index++) { day(index); store.logProgress(habit.id, 1); }
  day(13); store.repairStreak();
  for (let index = 13; index <= 28; index++) { day(index); store.logProgress(habit.id, 1); }
  day(31); assert.equal(progress().repairAllowance.used, false); assert.ok(progress().repair);
  const next = reopen(), balance = next.snapshot().collection.coins;
  next.repairStreak(); assert.equal(next.snapshot().collection.coins, balance - 6);
  assert.equal(next.snapshot().collection.repairs.length, 2);
  assert.throws(() => next.repairStreak(), /already used/);
  day(62); // January resets the allowance, but the last break is long expired.
  assert.equal(progress().repairAllowance.used, false); assert.equal(progress().repair, null);
  assert.throws(() => store.repairStreak(), /No broken streak/);
});
test('repairing after starting a new run combines completed days without backdated bonuses', t => {
  const { store, day, progress } = setup(t);
  store.nameBuddy('Pip'); const habit = store.addHabit({ name: 'Read', type: 'checkbox' });
  day(1); store.logProgress(habit.id, 1); day(2); store.logProgress(habit.id, 1);
  day(5); store.logProgress(habit.id, 1);
  assert.equal(progress().current, 1); assert.equal(progress().repair.count, 3);
  const fixture = store.snapshot(); fixture.collection.coins = 10; store.commit(fixture);
  store.repairStreak(); assert.equal(progress().current, 3); assert.equal(store.snapshot().collection.coins, 4);
  day(6); store.logProgress(habit.id, 1); assert.equal(store.snapshot().collection.coins, 5);
  day(7); store.logProgress(habit.id, 1); assert.equal(progress().current, 5); assert.equal(store.snapshot().collection.coins, 8);
});
test('purchases charge current prices once and owned glasses stay visible in the shop', t => {
  const { store, reopen } = setup(t);
  store.nameBuddy('Miso'); const fixture = store.snapshot(); fixture.collection.coins = 100; store.commit(fixture);
  const ids = ['daisy-crown', 'round-glasses', 'cozy-scarf', 'rainy-umbrella'];
  for (const id of ids) store.buyAccessory(id);
  const price = ids.reduce((sum, id) => sum + catalog.find(item => item.id === id).price, 0);
  assert.equal(store.snapshot().collection.coins, 100 - price);
  const before = store.snapshot(); store.buyAccessory('daisy-crown'); assert.deepEqual(store.snapshot(), before);
  assert.equal(reopen().snapshot().collection.equipped.eyes, 'round-glasses');
  const items = shopItems(store.snapshot().collection);
  assert.ok(items.some(item => item.id === 'round-glasses'));
  assert.ok(items.every(item => !item.retired));
  assert.equal(catalog.find(item => item.id === 'berry-beret').price, 7);
  assert.throws(() => store.buyAccessory('garden-sprout'));
  assert.ok(items.every((item, index) => !index || item.price >= items[index - 1].price));
  assert.ok(shopItems(store.snapshot().collection, 'streak').every(item => item.id === 'streak-repair'));
  assert.throws(() => store.equipOutfit({ ...before.collection.equipped, hat: 'moon-crown' }));
  assert.throws(() => store.equipOutfit({ hat: null }));
});
test('failed repair, purchase and reward writes preserve wallet, progress and disk data atomically', t => {
  const { store, file, day } = setup(t);
  store.nameBuddy('Miso'); const habit = store.addHabit({ name: 'Read', type: 'checkbox' });
  for (let index = 1; index <= 10; index++) { day(index); store.logProgress(habit.id, 1); }
  day(13); const before = store.snapshot(), bytes = fs.readFileSync(file, 'utf8');
  fs.mkdirSync(`${file}.tmp`);
  assert.throws(() => store.repairStreak()); assert.throws(() => store.buyAccessory('daisy-crown'));
  assert.throws(() => store.logProgress(habit.id, 1));
  assert.deepEqual(store.snapshot(), before); assert.equal(fs.readFileSync(file, 'utf8'), bytes);
});
test('retired companion ownership stays readable without rendering or offering it for sale', t => {
  const { store, reopen } = setup(t);
  store.nameBuddy('Miso'); const fixture = store.snapshot();
  fixture.collection.owned.push('garden-sprout'); fixture.collection.equipped.companion = 'garden-sprout';
  store.commit(fixture);
  const saved = reopen().snapshot();
  assert.ok(saved.collection.owned.includes('garden-sprout'));
  assert.equal(require('../src/renderer/wardrobe').accessoryMarkup('garden-sprout'), '');
  assert.ok(!shopItems(saved.collection).some(item => item.id === 'garden-sprout'));
});

test('buddy unlocks charge once, preserve the outfit and progress, and survive restart', t => {
  const { store, reopen } = setup(t);
  const { buddies, availableBuddies, buddyMarkup } = require('../src/renderer/wardrobe');
  store.nameBuddy('Miso');
  const habit = store.addHabit({ name: 'Water', type: 'count', goal: 8 }); store.logProgress(habit.id, 3);
  const fixture = store.snapshot(); fixture.collection.coins = 100; store.commit(fixture);
  store.buyAccessory('round-glasses');
  const before = store.snapshot();
  assert.equal(availableBuddies(before.collection).length, 3);
  assert.throws(() => store.updateSettings({ avatar: 'mushroom' }));
  for (const item of buddies) {
    const coins = store.snapshot().collection.coins;
    store.buyAccessory(item.id);
    const saved = reopen().snapshot();
    assert.equal(saved.collection.coins, coins - item.price);
    assert.equal(saved.settings.avatar, item.avatar);
    assert.equal(saved.settings.buddyName, 'Miso');
    assert.deepEqual(saved.days, before.days); assert.deepEqual(saved.habits, before.habits);
    assert.deepEqual(saved.collection.equipped, before.collection.equipped);
    store.buyAccessory(item.id); assert.equal(store.snapshot().collection.coins, saved.collection.coins);
    assert.match(buddyMarkup(item.avatar, saved.collection.equipped, true), new RegExp(`body-shape ${item.avatar}`));
    assert.match(buddyMarkup(item.avatar, saved.collection.equipped, true), /gaze-eyes.*sleepy-mouth/);
    store.updateSettings({ avatar: 'plant' }); store.updateSettings({ avatar: item.avatar });
  }
  assert.equal(availableBuddies(store.snapshot().collection).length, 6);
  assert.equal(shopItems(store.snapshot().collection, 'buddies').length, 3);
});

test('an unaffordable buddy never changes coins, ownership, or the selected character', t => {
  const { store } = setup(t); store.nameBuddy('Miso');
  const before = store.snapshot();
  assert.throws(() => store.buyAccessory('buddy-cloud'));
  assert.deepEqual(store.snapshot(), before);
});
test('migration preserves balances and purchases while every receipt follows the current tier table', t => {
  const { store, file, day, reopen, now } = setup(t);
  store.nameBuddy('Stella'); const habit = store.addHabit({ name: 'Read', type: 'checkbox' });
  for (let index = 1; index <= 10; index++) { day(index); store.logProgress(habit.id, 1); }
  const old = store.snapshot();
  Object.assign(old.collection, { coins: 21, milestones: ['2026-11-01:3', '2026-11-01:10'], months: ['2026-11'], owned: ['cozy-scarf'] });
  old.collection.equipped.neck = 'cozy-scarf';
  delete old.collection.equipped.companion; delete old.collection.economyVersion; delete old.collection.earnings;
  fs.writeFileSync(file, JSON.stringify(old));
  const next = reopen(); next.refreshRewards();
  assert.equal(next.snapshot().collection.coins, 21);
  assert.deepEqual(next.snapshot().habits, old.habits); assert.deepEqual(next.snapshot().days, old.days);
  assert.equal(next.snapshot().collection.equipped.neck, 'cozy-scarf');
  assert.equal(next.snapshot().collection.equipped.companion, null);
  assert.deepEqual(coinEarnings(next.snapshot(), now()).map(item => item.coins), [1, 4]);
  assert.equal(next.snapshot().collection.legacyMilestones, undefined);
  assert.equal(next.snapshot().collection.months, undefined);
  next.updateSettings({ buddyName: 'Stella' });
  day(11); next.refreshRewards(); assert.equal(next.snapshot().collection.coins, 21);
  next.logProgress(habit.id, 1); assert.equal(next.snapshot().collection.coins, 22);
});
test('version-two three-day receipts convert to one bonus coin and retired monthly receipts disappear', t => {
  const { store, day, file, reopen, now } = setup(t);
  store.nameBuddy('Miso'); const habit = store.addHabit({ name: 'Read', type: 'checkbox' });
  for (const value of [1, 2, 3]) { day(value); store.logProgress(habit.id, 1); }
  const old = store.snapshot();
  Object.assign(old.collection, { economyVersion: 2, coins: 9, months: ['2026-11'], legacyMilestones: ['2026-11-01:3'], earnings: [
    { id: 'daily:2026-11-03', kind: 'daily', day: '2026-11-03', coins: 1 },
    { id: 'streak:2026-11-01:3', kind: 'streak', day: '2026-11-03', coins: 5, streak: 3 },
    { id: 'monthly:2026-11', kind: 'monthly', day: '2026-11-03', coins: 1 },
  ] });
  fs.writeFileSync(file, JSON.stringify(old));
  const next = reopen(); next.refreshRewards();
  const receipt = coinEarnings(next.snapshot(), now());
  assert.deepEqual(receipt.map(item => [item.kind, item.coins]), [['daily', 1], ['streak', 1]]);
  assert.equal(receipt.reduce((sum, reward) => sum + reward.coins, 0), 2);
  assert.equal(next.snapshot().collection.coins, 9);
  next.logProgress(habit.id, 1); next.openMystery(); next.refreshRewards();
  assert.equal(next.snapshot().collection.coins, 9);
  assert.deepEqual(coinEarnings(reopen().snapshot(), now()), receipt);
  const invalid = next.snapshot(); invalid.collection.earnings.find(reward => reward.kind === 'streak').coins = 5;
  assert.throws(() => next.commit(invalid), /earning history/);
});
