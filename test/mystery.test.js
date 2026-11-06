'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../src/store');
const { mysteryStatus } = require('../src/renderer/domain');
const { chooseSurprise, formatSurprise, pool } = require('../src/mystery');
const { pool: randomPool } = require('../src/thoughts');
function setup(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'habit-buddy-reward-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let now = new Date(2026, 10, 6, 12);
  const options = { now: () => now, random: () => .3 };
  const file = path.join(directory, 'state.json');
  return { store: new Store(file, options), reopen: () => new Store(file, options), file, now: () => now, tomorrow: () => { now = new Date(2026, 10, 7, 12); } };
}
test('a box needs at least one habit and all current habits complete; it opens once across restarts', t => {
  const { store, reopen, now } = setup(t);
  assert.equal(store.openMystery().opened, false);
  const habit = store.addHabit({ name: 'Water', type: 'count', goal: 2 });
  store.logProgress(habit.id, 1); assert.equal(mysteryStatus(store.snapshot(), now()).available, false);
  store.logProgress(habit.id, 1); assert.equal(mysteryStatus(store.snapshot(), now()).available, true);
  assert.equal(store.openMystery().opened, true);
  assert.equal(store.openMystery().opened, false);
  assert.equal(reopen().openMystery().opened, false);
});
test('new habits earn another box while edits, corrections, and removals cannot reopen a claimed one', t => {
  const { store, now } = setup(t);
  const first = store.addHabit({ name: 'Walk', type: 'minutes', goal: 10 });
  store.logProgress(first.id, 10); const firstReward = store.openMystery();
  store.logProgress(first.id, 5, { replace: true }); store.logProgress(first.id, 10, { replace: true });
  assert.equal(store.openMystery().opened, false);
  store.editHabit(first.id, { name: 'A little walk', type: 'minutes', goal: 10 });
  assert.equal(store.openMystery().opened, false);
  const second = store.addHabit({ name: 'Rest', type: 'checkbox' });
  assert.equal(mysteryStatus(store.snapshot(), now()).available, false);
  store.logProgress(second.id, 1); const secondReward = store.openMystery();
  assert.equal(secondReward.opened, true); assert.notEqual(firstReward.item.type, secondReward.item.type);
  store.archiveHabit(second.id); assert.equal(store.openMystery().opened, false);
  const removed = store.addHabit({ name: 'Later', type: 'checkbox' }); store.archiveHabit(removed.id);
  assert.equal(store.openMystery().opened, false);
});
test('tomorrow has a fresh box after fresh completion and a pending box disappears if progress is corrected', t => {
  const { store, tomorrow, now } = setup(t);
  const habit = store.addHabit({ name: 'Read', type: 'minutes', goal: 15 });
  store.logProgress(habit.id, 15); store.openMystery(); tomorrow();
  assert.equal(mysteryStatus(store.snapshot(), now()).available, false);
  store.logProgress(habit.id, 15); assert.equal(mysteryStatus(store.snapshot(), now()).available, true);
  store.logProgress(habit.id, 5, { replace: true }); assert.equal(store.openMystery().opened, false);
  store.logProgress(habit.id, 15, { replace: true }); assert.equal(store.openMystery().opened, true);
});
test('content stays offline, avoids consecutive categories, and uses every item before repeating', () => {
  assert.equal(new Set(pool.map(item => item.id)).size, pool.length);
  let history = { usedIds: [], lastType: null }, seed = 42, seen = new Set();
  for (let index = 0; index < pool.length * 5; index++) {
    const selected = chooseSurprise(history, () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; });
    assert.notEqual(selected.lastType, history.lastType);
    if (index % pool.length === 0) seen = new Set();
    assert.equal(seen.has(selected.item.id), false); seen.add(selected.item.id);
    history = selected;
  }
});
test('a failed save cannot consume a mystery box', t => {
  const { store, file, now } = setup(t);
  const habit = store.addHabit({ name: 'Rest', type: 'checkbox' }); store.logProgress(habit.id, 1);
  const before = fs.readFileSync(file, 'utf8'); fs.mkdirSync(`${file}.tmp`);
  assert.throws(() => store.openMystery());
  assert.equal(mysteryStatus(store.snapshot(), now()).available, true);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('content entries load correctly and author/answer fields are included in the bubble', () => {
  assert.equal(pool.length + randomPool.length, 100);
  assert.equal(new Set([...pool, ...randomPool].map(item => item.id)).size, 100);
  assert.ok(pool.every(item => ['quote', 'inspiration'].includes(item.type)));
  assert.ok(randomPool.every(item => !['quote', 'inspiration'].includes(item.type)));
  for (const item of [...pool, ...randomPool]) {
    for (const key of ['id', 'type', 'title', 'text']) assert.ok(typeof item[key] === 'string' && item[key].trim());
    for (const key of ['author', 'answer']) if (item[key] !== undefined) assert.equal(typeof item[key], 'string');
  }
  const quote = pool.find(item => item.author), joke = randomPool.find(item => item.answer);
  assert.ok(quote); assert.ok(joke);
  assert.equal(formatSurprise(quote), `${quote.text}\n— ${quote.author}`);
  assert.equal(formatSurprise(joke), `${joke.text}\n\n${joke.answer}`);
});
