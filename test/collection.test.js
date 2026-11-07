'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../src/store');
const { catalog } = require('../src/renderer/wardrobe');
function setup(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'buddy-collection-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'state.json');
  let now = new Date(2026, 10, 1, 12);
  const options = { now: () => now };
  const store = new Store(file, options);
  return { store, file, reopen: () => new Store(file, options), day: value => { now = new Date(2026, 10, value, 12); } };
}

test('one daily coin, one monthly hello, and no duplicate rewards for new habits, corrections or restarts', t => {
  const { store, reopen } = setup(t);
  assert.equal(store.snapshot().collection.coins, 0);
  store.nameBuddy('Miso');
  assert.equal(store.snapshot().collection.coins, 1);
  const read = store.addHabit({ name: 'Read', type: 'minutes', goal: 15 });
  store.logProgress(read.id, 7); assert.equal(store.snapshot().collection.coins, 1);
  store.logProgress(read.id, 15, { replace: true }); assert.equal(store.snapshot().collection.coins, 2);
  store.logProgress(read.id, 10, { replace: true }); store.logProgress(read.id, 15, { replace: true });
  store.openMystery();
  const water = store.addHabit({ name: 'Water', type: 'checkbox' }); store.logProgress(water.id, 1); store.openMystery();
  store.archiveHabit(water.id);
  const next = reopen(); next.refreshRewards(); next.nameBuddy('Pip');
  assert.equal(next.snapshot().collection.coins, 2);
  assert.deepEqual(next.snapshot().collection.rewardedDays, ['2026-11-01']);
});

test('streak bonuses arrive once at 3, 10 and 30 days, with a fresh monthly coin', t => {
  const { store, day, reopen } = setup(t);
  store.nameBuddy('Pip'); const habit = store.addHabit({ name: 'Walk', type: 'checkbox' });
  for (let index = 1; index <= 30; index++) {
    day(index); store.logProgress(habit.id, 1);
    const bonuses = [3, 10, 30].filter(value => index >= value).length * 5;
    assert.equal(store.snapshot().collection.coins, 1 + index + bonuses);
    assert.equal(store.refreshRewards(), null);
  }
  assert.equal(store.snapshot().collection.milestones.length, 3);
  day(31); const next = reopen(); next.refreshRewards(); next.refreshRewards();
  assert.equal(next.snapshot().collection.coins, 47);
  assert.deepEqual(next.snapshot().collection.months, ['2026-11', '2026-12']);
  next.logProgress(habit.id, 1); assert.equal(next.snapshot().collection.coins, 48);
});

test('missing days keeps coins and outfits, and a new three-day streak can earn a new bonus', t => {
  const { store, day } = setup(t);
  store.nameBuddy('Miso'); const habit = store.addHabit({ name: 'Rest', type: 'checkbox' });
  for (let index = 1; index <= 3; index++) { day(index); store.logProgress(habit.id, 1); }
  store.buyAccessory('daisy-crown');
  const before = store.snapshot().collection;
  day(5); store.refreshRewards();
  assert.deepEqual(store.snapshot().collection, before);
  for (let index = 5; index <= 7; index++) { day(index); store.logProgress(habit.id, 1); }
  assert.equal(store.snapshot().collection.coins, before.coins + 8);
  assert.deepEqual(store.snapshot().collection.owned, ['daisy-crown']);
  assert.equal(store.snapshot().collection.equipped.hat, 'daisy-crown');
});

test('purchases charge the catalog price once, equip the item, and persist mix-and-match outfits', t => {
  const { store, day, reopen } = setup(t);
  store.nameBuddy('Miso'); const habit = store.addHabit({ name: 'Read', type: 'checkbox' });
  for (let index = 1; index <= 10; index++) { day(index); store.logProgress(habit.id, 1); }
  const before = store.snapshot().collection.coins;
  for (const id of ['daisy-crown', 'round-glasses', 'cozy-scarf', 'rainy-umbrella']) store.buyAccessory(id);
  assert.equal(store.snapshot().collection.coins, before - 18);
  const after = store.snapshot(); store.buyAccessory('daisy-crown');
  assert.deepEqual(store.snapshot(), after);
  const next = reopen();
  assert.deepEqual(next.snapshot().collection.equipped, { hat: 'daisy-crown', eyes: 'round-glasses', neck: 'cozy-scarf', hand: 'rainy-umbrella' });
  next.equipOutfit({ ...next.snapshot().collection.equipped, hat: null });
  assert.equal(reopen().snapshot().collection.equipped.hat, null);
  assert.equal(next.snapshot().collection.owned.length, 4);
});

test('invalid or unaffordable purchases and unowned/wrong-slot outfits cannot change the wallet', t => {
  const { store } = setup(t);
  store.nameBuddy('Miso'); const before = store.snapshot();
  assert.throws(() => store.buyAccessory('moon-crown'));
  assert.throws(() => store.buyAccessory('missing'));
  assert.throws(() => store.equipOutfit({ ...before.collection.equipped, hat: 'moon-crown' }));
  assert.throws(() => store.equipOutfit({ hat: null }));
  assert.deepEqual(store.snapshot(), before);
});

test('failed purchase and reward saves leave persisted and in-memory coins intact', t => {
  const { store, file, day } = setup(t);
  store.nameBuddy('Miso'); const habit = store.addHabit({ name: 'Read', type: 'checkbox' });
  for (let index = 1; index <= 3; index++) { day(index); store.logProgress(habit.id, 1); }
  const before = store.snapshot(), bytes = fs.readFileSync(file, 'utf8');
  fs.mkdirSync(`${file}.tmp`);
  assert.throws(() => store.buyAccessory('daisy-crown'));
  day(4); assert.throws(() => store.logProgress(habit.id, 1));
  assert.deepEqual(store.snapshot(), before);
  assert.equal(fs.readFileSync(file, 'utf8'), bytes);
});

test('existing users gain a collection without losing habits, progress or their buddy', t => {
  const { store, file, reopen } = setup(t);
  store.nameBuddy('Stella'); const habit = store.addHabit({ name: 'Read', type: 'checkbox' }); store.logProgress(habit.id, 1);
  const old = store.snapshot(); delete old.collection; fs.writeFileSync(file, JSON.stringify(old));
  const next = reopen(); next.refreshRewards();
  assert.equal(next.snapshot().settings.buddyName, 'Stella');
  assert.deepEqual(next.snapshot().habits, old.habits); assert.deepEqual(next.snapshot().days, old.days);
  assert.equal(next.snapshot().collection.coins, 2);
  next.refreshRewards(); assert.equal(next.snapshot().collection.coins, 2);
  assert.equal(new Set(catalog.map(item => item.id)).size, catalog.length);
});
