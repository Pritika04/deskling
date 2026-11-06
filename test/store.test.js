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

test('logs supported types, caps count goals, and signals completion once', t => {
  const { store, file } = setup(t, { now: () => new Date(2026, 10, 6, 12) });
  const count = store.addHabit({ name: 'Water', type: 'count', goal: 8 });
  const checkbox = store.addHabit({ name: 'Rest', type: 'checkbox' });
  const minutes = store.addHabit({ name: 'Meditate', type: 'minutes', goal: 15 });
  const reading = store.addHabit({ name: 'Read', type: 'count', goal: 100 });
  assert.equal(store.logProgress(count.id, 3).amount, 3);
  assert.equal(store.logProgress(count.id, 99).amount, 8);
  assert.equal(store.logProgress(count.id, 1).completed, false);
  assert.equal(store.logProgress(checkbox.id, 1).completed, true);
  assert.equal(store.logProgress(minutes.id, 7.5).allComplete, false);
  store.logProgress(minutes.id, 7.5);
  assert.equal(store.logProgress(reading.id, 100).allComplete, true);
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
  assert.deepEqual(store.snapshot().days['2026-11-07'], []);
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

test('editing affects today, preserves past snapshots, and changing type resets only today', t => {
  let now = new Date(2026, 10, 5, 12);
  const { store, file } = setup(t, { now: () => now });
  const habit = store.addHabit({ name: 'Water', type: 'count', goal: 8, reminderTimes: ['09:00'] });
  store.logProgress(habit.id, 4);
  now = new Date(2026, 10, 6, 12); store.logProgress(habit.id, 3);
  store.editHabit(habit.id, { name: 'Drink water', type: 'count', goal: 2 });
  assert.equal(store.snapshot().days['2026-11-05'][0].goal, 8);
  assert.equal(store.snapshot().days['2026-11-05'][0].name, 'Water');
  assert.equal(store.snapshot().days['2026-11-06'][0].amount, 2);
  store.editHabit(habit.id, { name: 'Water', type: 'checkbox' });
  assert.equal(store.snapshot().days['2026-11-06'][0].amount, 0);
  store.archiveHabit(habit.id);
  assert.equal(new Store(file).snapshot().days['2026-11-05'][0].amount, 4);
});

test('appearance preferences migrate, persist, and reject invalid values', t => {
  const { store, file } = setup(t);
  const legacy = store.snapshot();
  for (const key of ['avatar', 'palette', 'accent']) delete legacy.settings[key];
  fs.writeFileSync(file, JSON.stringify(legacy));
  const migrated = new Store(file);
  assert.equal(migrated.snapshot().settings.avatar, 'plant');
  migrated.updateSettings({ avatar: 'pineapple', palette: 'lavender', accent: '#123456' });
  assert.equal(new Store(file).snapshot().settings.accent, '#123456');
  assert.throws(() => migrated.updateSettings({ avatar: 'missing' }));
  assert.throws(() => migrated.updateSettings({ accent: 'url(https://example.com)' }));
  assert.throws(() => migrated.addHabit({ name: 'Test', type: 'count', goal: 2, reminderTimes: ['25:00'] }));
});

test('habit order persists, rejects incomplete orders, and leaves historical snapshots intact', t => {
  const { store, file } = setup(t);
  const first = store.addHabit({ name: 'Water', type: 'count', goal: 8, unit: 'glasses' });
  const second = store.addHabit({ name: 'Rest', type: 'checkbox' });
  store.logProgress(first.id, 1);
  const history = structuredClone(store.snapshot().days);
  store.reorderHabits([second.id, first.id]);
  assert.deepEqual(new Store(file).snapshot().habits.map(habit => habit.id), [second.id, first.id]);
  assert.deepEqual(store.snapshot().days, history);
  assert.throws(() => store.reorderHabits([first.id]));
  assert.throws(() => store.reorderHabits([first.id, first.id]));
});

test('daily reset keeps habits, reminders, units, and order across a restart', t => {
  let now = new Date(2026, 11, 31, 23, 59);
  const { store, file } = setup(t, { now: () => now });
  const habit = store.addHabit({ name: 'Water', type: 'count', goal: 8, unit: 'glasses', reminder: { mode: 'repeat', time: '09:00', until: '20:00', everyMinutes: 120 } });
  store.logProgress(habit.id, 8);
  now = new Date(2027, 0, 1, 0, 1);
  const restarted = new Store(file, { now: () => now });
  const { summary } = require('../src/renderer/domain');
  assert.equal(summary(restarted.snapshot(), now).entries[0].amount, 0);
  assert.deepEqual(restarted.snapshot().habits, store.snapshot().habits);
  assert.equal(restarted.logProgress(habit.id, 1).amount, 1);
  assert.equal(restarted.snapshot().days['2026-12-31'][0].amount, 8);
});

test('minute totals can be corrected, exceed the goal, and persist through the same logging entry point', t => {
  const { store, file } = setup(t, { now: () => new Date(2026, 10, 6, 12) });
  const habit = store.addHabit({ name: 'Walk', type: 'minutes', goal: 15 });
  assert.equal(store.logProgress(habit.id, 22.5, { replace: true }).completed, true);
  assert.equal(new Store(file).snapshot().days['2026-11-06'][0].amount, 22.5);
  assert.equal(store.logProgress(habit.id, 10, { replace: true }).amount, 10);
  assert.equal(store.logProgress(habit.id, 0, { replace: true }).amount, 0);
  assert.throws(() => store.logProgress(habit.id, -1, { replace: true }));
  const count = store.addHabit({ name: 'Water', type: 'count', goal: 8 });
  assert.throws(() => store.logProgress(count.id, 3, { replace: true }));
});

test('retired avatars become sprouts and percent habits become counts without rewriting past days', t => {
  const { store, file } = setup(t, { now: () => new Date(2026, 10, 6, 12) });
  const habit = store.addHabit({ name: 'Read', type: 'count', goal: 100 });
  assert.equal(habit.goal, 100);
  const legacy = store.snapshot(); legacy.settings.avatar = 'cat'; legacy.habits[0].goal = 50; legacy.habits[0].type = 'percent';
  legacy.days['2026-11-05'] = [{ ...legacy.habits[0], amount: 50 }];
  fs.writeFileSync(file, JSON.stringify(legacy));
  const reopened = new Store(file, { now: () => new Date(2026, 10, 6, 12) });
  assert.equal(reopened.snapshot().settings.avatar, 'plant');
  assert.equal(reopened.snapshot().habits[0].goal, 100);
  assert.equal(reopened.snapshot().habits[0].type, 'count');
  assert.equal(reopened.snapshot().habits[0].unit, 'points');
  assert.equal(reopened.snapshot().days['2026-11-05'][0].goal, 50);
  assert.throws(() => reopened.addHabit({ name: 'No percentages', type: 'percent', goal: 100 }));
});

test('halfway reacts once per habit per day and stays remembered across restarts', t => {
  let now = new Date(2026, 10, 6, 12);
  const { store, file } = setup(t, { now: () => now });
  const habit = store.addHabit({ name: 'Water', type: 'count', goal: 8 });
  assert.equal(store.logProgress(habit.id, 3).halfway, false);
  assert.equal(store.logProgress(habit.id, 1).halfway, true);
  const restarted = new Store(file, { now: () => now });
  assert.equal(restarted.logProgress(habit.id, 1).halfway, false);
  assert.equal(restarted.logProgress(habit.id, 3).completed, true);
  now = new Date(2026, 10, 7, 12);
  assert.equal(restarted.logProgress(habit.id, 4).halfway, true);
});

test('minute corrections cannot repeat halfway, and completion takes priority over halfway', t => {
  const { store } = setup(t);
  const minutes = store.addHabit({ name: 'Walk', type: 'minutes', goal: 20 });
  assert.equal(store.logProgress(minutes.id, 10, { replace: true }).halfway, true);
  store.logProgress(minutes.id, 5, { replace: true });
  assert.equal(store.logProgress(minutes.id, 12, { replace: true }).halfway, false);
  const reading = store.addHabit({ name: 'Read', type: 'count', goal: 100 });
  const completed = store.logProgress(reading.id, 100);
  assert.equal(completed.completed, true);
  assert.equal(completed.halfway, false);
  const checkbox = store.addHabit({ name: 'Rest', type: 'checkbox' });
  assert.equal(store.logProgress(checkbox.id, 1).halfway, false);
});

test('removing three completed habits then adding one gives zero of one today, with earlier history intact', t => {
  let now = new Date(2026, 10, 5, 12);
  const { store, file } = setup(t, { now: () => now });
  const habits = Array.from({ length: 3 }, (_, index) => store.addHabit({ name: `Habit ${index}`, type: 'checkbox' }));
  for (const habit of habits) store.logProgress(habit.id, 1);
  const past = structuredClone(store.snapshot().days['2026-11-05']);
  now = new Date(2026, 10, 6, 12);
  for (const habit of habits) store.logProgress(habit.id, 1);
  for (const habit of habits) store.archiveHabit(habit.id);
  store.addHabit({ name: 'New habit', type: 'checkbox' });
  const { summary } = require('../src/renderer/domain');
  const data = summary(new Store(file, { now: () => now }).snapshot(), now);
  assert.equal(data.total, 1); assert.equal(data.completed, 0); assert.equal(data.allComplete, false);
  assert.deepEqual(store.snapshot().days['2026-11-05'], past);
});

test('old archived entries do not count in today totals before the next write', t => {
  const { store } = setup(t, { now: () => new Date(2026, 10, 6, 12) });
  const habit = store.addHabit({ name: 'Retired', type: 'checkbox' }); store.logProgress(habit.id, 1);
  const legacy = store.snapshot(); legacy.habits[0].archived = true; legacy.days['2026-11-06'][0].archived = true;
  const { summary } = require('../src/renderer/domain');
  const data = summary(legacy, new Date(2026, 10, 6, 12));
  assert.equal(data.total, 0); assert.equal(data.completed, 0); assert.equal(data.progress, false);
});
