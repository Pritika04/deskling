'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../src/store');
const { WelcomeManager, chooseWelcome, HOUR } = require('../src/welcome');
function setup(t, hour = 8) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'buddy-welcome-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'state.json');
  let now = new Date(2026, 10, 7, hour);
  const options = { now: () => now };
  const store = new Store(file, options); store.nameBuddy('Miso');
  const managerOptions = { now: () => now, random: () => 0 };
  return { store, file, manager: new WelcomeManager(store, managerOptions), advance: ms => { now = new Date(now.getTime() + ms); }, set: date => { now = date; }, reopen: () => new WelcomeManager(new Store(file, options), managerOptions) };
}

test('first daily welcome persists across restarts and returns tomorrow with a fresh message', t => {
  const { manager, store, reopen, advance, set } = setup(t);
  assert.equal(manager.active(), true);
  const first = manager.take(); assert.equal(first.kind, 'daily');
  assert.equal(store.snapshot().welcomes.day, '2026-11-07');
  advance(5 * 60000); const next = reopen();
  assert.equal(next.active(), false); assert.equal(next.take(), null);
  set(new Date(2026, 10, 8, 8));
  assert.equal(next.active(), true);
  const second = next.take(); assert.equal(second.kind, 'daily'); assert.notEqual(second.text, first.text);
});

test('resume waits for unlock, and overlapping lock/suspend events greet once after an hour away', t => {
  const { manager, advance } = setup(t);
  manager.active(); manager.take();
  manager.leave('lock'); advance(5 * 60000); manager.leave('suspend');
  advance(60 * 60000); manager.back('resume');
  assert.equal(manager.pending, null); assert.equal(manager.away, true);
  assert.equal(manager.back('unlock'), true);
  assert.equal(manager.take().kind, 'return');
  assert.equal(manager.back('resume'), false); assert.equal(manager.back('unlock'), false); assert.equal(manager.take(), null);
});

test('short breaks stay quiet, while the first morning welcome wins over a long-break greeting', t => {
  const { manager, advance, set } = setup(t);
  manager.active(); manager.take();
  manager.leave('lock'); advance(HOUR - 1); assert.equal(manager.back('unlock'), false);
  manager.leave('suspend'); set(new Date(2026, 10, 8, 7));
  manager.back('resume'); assert.equal(manager.take().kind, 'daily'); assert.equal(manager.take(), null);
});

test('the morning boundary is 5 AM and hatching counts as the first hello', t => {
  const { manager, set, advance } = setup(t, 4);
  manager.firstHello(); advance(20 * 60000); assert.equal(manager.active(), false);
  set(new Date(2026, 10, 7, 5)); assert.equal(manager.active(), true); assert.equal(manager.take().kind, 'daily');
  advance(10 * 60000); manager.firstHello(); assert.equal(manager.active(), false);
});

test('active work updates the last visit without manufacturing welcomes; locked time remains away', t => {
  const { manager, store, advance, reopen } = setup(t);
  manager.active(); manager.take();
  for (let index = 0; index < 12; index++) { advance(5 * 60000); manager.recordActive(true); }
  assert.equal(reopen().active(), false);
  manager.leave('lock'); const awayAt = store.snapshot().welcomes.lastSeenAt;
  advance(2 * HOUR); manager.recordActive(true, true);
  assert.equal(store.snapshot().welcomes.lastSeenAt, awayAt);
  manager.back('unlock'); assert.equal(manager.take().kind, 'return');
});

test('a failed save cannot consume a queued greeting or overwrite other user data', t => {
  const { manager, store, file } = setup(t);
  const habit = store.addHabit({ name: 'Water', type: 'count', goal: 8 }); store.logProgress(habit.id, 2);
  manager.active(); const before = store.snapshot(), bytes = fs.readFileSync(file, 'utf8');
  fs.mkdirSync(`${file}.tmp`);
  assert.throws(() => manager.take()); assert.ok(manager.pending);
  assert.deepEqual(store.snapshot(), before); assert.equal(fs.readFileSync(file, 'utf8'), bytes);
});

test('legacy data gains welcome history, and message choices avoid consecutive repeats', t => {
  const { store, file } = setup(t);
  const old = store.snapshot(); delete old.welcomes; fs.writeFileSync(file, JSON.stringify(old));
  const migrated = new Store(file);
  assert.deepEqual(migrated.snapshot().collection, old.collection);
  assert.equal(migrated.snapshot().settings.buddyName, 'Miso');
  const now = new Date(2026, 10, 7, 8);
  for (const kind of ['daily', 'return']) {
    const first = chooseWelcome(kind, now, '', () => 0);
    assert.notEqual(chooseWelcome(kind, now, first, () => 0), first);
  }
});
