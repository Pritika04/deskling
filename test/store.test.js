'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store, localDay } = require('../src/store');

function setup(t, options) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'habit-buddy-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'state.json');
  return { file, store: new Store(file, options) };
}

test('starts empty, persists settings, and returns independent snapshots', t => {
  const { store, file } = setup(t);
  assert.deepEqual(store.snapshot().habits, []);
  assert.deepEqual(store.snapshot().days, {});
  store.updateSettings({ avatarPosition: { x: -90, y: 420 }, remindersPaused: true });
  const copy = store.snapshot();
  copy.habits.push({});
  assert.equal(store.snapshot().habits.length, 0);
  assert.deepEqual(new Store(file).snapshot(), store.snapshot());
});

test('logs all four types, caps goals, and signals completion once', t => {
  const { store, file } = setup(t, { now: () => new Date(2026, 10, 6, 12) });
  const count = store.addHabit({ name: 'Water', type: 'count', goal: 8 });
  const checkbox = store.addHabit({ name: 'Rest', type: 'checkbox' });
  const minutes = store.addHabit({ name: 'Meditate', type: 'minutes', goal: 15 });
  const percent = store.addHabit({ name: 'Read', type: 'percent', goal: 100 });
  assert.equal(store.logProgress(count.id, 3).amount, 3);
  assert.equal(store.logProgress(count.id, 99).amount, 8);
  assert.equal(store.logProgress(count.id, 1).completed, false);
  assert.equal(store.logProgress(checkbox.id, 1).completed, true);
  assert.equal(store.logProgress(minutes.id, 7.5).allComplete, false);
  store.logProgress(minutes.id, 7.5);
  assert.equal(store.logProgress(percent.id, 100).allComplete, true);
  assert.equal(new Store(file).snapshot().days['2026-11-06'][0].amount, 8);
});

test('invalid progress and settings do not change disk or memory', t => {
  const { store, file } = setup(t);
  const habit = store.addHabit({ name: 'Water', type: 'count', goal: 8 });
  const original = fs.readFileSync(file, 'utf8');
  for (const amount of [0, -1, NaN, Infinity, '1']) assert.throws(() => store.logProgress(habit.id, amount));
  assert.throws(() => store.logProgress('missing', 1));
  assert.throws(() => store.updateSettings({ dayStartHour: 24 }));
  assert.throws(() => store.addHabit({ name: ' ', type: 'count', goal: 8 }));
  assert.equal(fs.readFileSync(file, 'utf8'), original);
  assert.deepEqual(JSON.parse(original), store.snapshot());
});

test('new local days reset progress and archiving preserves history', t => {
  let now = new Date(2026, 10, 6, 23, 30);
  const { store } = setup(t, { now: () => now });
  const habit = store.addHabit({ name: 'Stretch', type: 'checkbox' });
  store.logProgress(habit.id, 1);
  now = new Date(2026, 10, 7, 0, 10);
  assert.equal(store.logProgress(habit.id, 1).completed, true);
  store.archiveHabit(habit.id);
  assert.throws(() => store.logProgress(habit.id, 1));
  assert.equal(store.snapshot().days['2026-11-06'][0].amount, 1);
  assert.equal(store.snapshot().days['2026-11-07'][0].amount, 1);
});

test('local rollover uses calendar dates across month/year and DST boundaries', () => {
  assert.equal(localDay(new Date(2026, 0, 1, 2), 4), '2025-12-31');
  assert.equal(localDay(new Date(2026, 2, 9, 3), 4), '2026-03-08');
  assert.equal(localDay(new Date(2026, 10, 6, 4), 4), '2026-11-06');
});

test('corrupt and unsupported files are preserved instead of overwritten', t => {
  const { file } = setup(t);
  for (const contents of ['not JSON', '{"version":99}']) {
    fs.writeFileSync(file, contents);
    assert.throws(() => new Store(file), /Could not load/);
    assert.equal(fs.readFileSync(file, 'utf8'), contents);
  }
});

test('failed disk save leaves in-memory state unchanged', t => {
  const { store, file } = setup(t);
  const before = store.snapshot();
  fs.mkdirSync(`${file}.tmp`);
  assert.throws(() => store.updateSettings({ remindersPaused: true }));
  assert.deepEqual(store.snapshot(), before);
});

test('older files gain the default buddy size and custom size survives restart', t => {
  const { store, file } = setup(t);
  const legacy = store.snapshot();
  delete legacy.settings.avatarSize;
  fs.writeFileSync(file, JSON.stringify(legacy));
  const reopened = new Store(file);
  assert.equal(reopened.snapshot().settings.avatarSize, 68);
  reopened.updateSettings({ avatarSize: 72 });
  assert.equal(new Store(file).snapshot().settings.avatarSize, 72);
  for (const avatarSize of [63, 161, NaN, '80', 80.5]) assert.throws(() => reopened.updateSettings({ avatarSize }));
  assert.equal(new Store(file).snapshot().settings.avatarSize, 72);
});
