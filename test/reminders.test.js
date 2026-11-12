'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { dueReminders } = require('../src/reminders');
const { processReminders } = require('../src/reminders');
const { ReminderMessages } = require('../src/reminders');
const templates = require('../content/reminders.json');
const { Store } = require('../src/store');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
function state(reminder) {
  return { settings: { remindersPaused: false, dayStartHour: 0 }, days: {}, reminderDeliveries: {}, habits: [{ id: 'a', name: 'Water', type: 'count', goal: 8, archived: false, reminder }] };
}

test('reminder wording has 50+ unique choices and uses the full pool before repeating', () => {
  assert.ok(templates.length >= 50);
  assert.equal(new Set(templates).size, templates.length);
  assert.ok(templates.every(text => text.includes('{habit}')));
  const picker = new ReminderMessages(() => 0.42);
  const cycle = Array.from({ length: templates.length }, () => picker.next('Drink water'));
  assert.equal(new Set(cycle).size, templates.length);
  assert.ok(cycle.every(text => text.includes('Drink water') && !text.includes('{habit}')));
  assert.notEqual(picker.next('Drink water'), cycle.at(-1));
  assert.ok(picker.next('Read 10 pages').includes('Read 10 pages'));
});
test('daily reminders fire at the chosen clock time and do not repeat after restart', () => {
  const data = state({ mode: 'daily', time: '09:15' });
  assert.equal(dueReminders(data, new Date(2026, 10, 6, 9, 14)).length, 0);
  const due = dueReminders(data, new Date(2026, 10, 6, 9, 15));
  assert.equal(due.length, 1);
  data.reminderDeliveries.a = due[0].slot;
  assert.equal(dueReminders(structuredClone(data), new Date(2026, 10, 6, 9, 15, 45)).length, 0);
  assert.equal(dueReminders(data, new Date(2026, 10, 7, 9, 15)).length, 1);
});
test('repeating reminders respect the clock, frequency, pause, completion and archive', () => {
  const data = state({ mode: 'repeat', time: '09:00', until: '17:00', everyMinutes: 120 });
  for (const hour of [9, 11, 13, 15, 17]) assert.equal(dueReminders(data, new Date(2026, 10, 6, hour)).length, 1);
  for (const hour of [8, 10, 18, 19]) assert.equal(dueReminders(data, new Date(2026, 10, 6, hour)).length, 0);
  data.settings.remindersPaused = true;
  assert.equal(dueReminders(data, new Date(2026, 10, 6, 11)).length, 0);
  data.settings.remindersPaused = false;
  data.days['2026-11-06'] = [{ ...data.habits[0], amount: 8 }];
  assert.equal(dueReminders(data, new Date(2026, 10, 6, 11)).length, 0);
  data.days = {}; data.habits[0].archived = true;
  assert.equal(dueReminders(data, new Date(2026, 10, 6, 11)).length, 0);
});

function queuedStore(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'habit-buddy-reminder-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'state.json');
  const now = new Date(2026, 10, 6, 9);
  const options = { now: () => now };
  return { store: new Store(file, options), now, reopen: () => new Store(file, options) };
}
test('simultaneous reminders queue one at a time and survive restarts without duplicates', t => {
  const { store, now, reopen } = queuedStore(t);
  for (const name of ['Water', 'Rest']) store.addHabit({ name, type: 'checkbox', reminder: { mode: 'daily', time: '09:00' } });
  processReminders(store, () => false, now);
  assert.equal(store.snapshot().reminderQueue.length, 2);
  const restarted = reopen(), shown = [];
  processReminders(restarted, habit => { shown.push(habit.name); }, now);
  assert.equal(restarted.snapshot().reminderQueue.length, 1);
  processReminders(restarted, habit => { shown.push(habit.name); }, now);
  processReminders(restarted, habit => { shown.push(habit.name); }, now);
  assert.deepEqual(shown, ['Water', 'Rest']);
});
test('queued reminders are dropped when paused, completed, removed, or stale', t => {
  const { store, now } = queuedStore(t);
  const habit = store.addHabit({ name: 'Rest', type: 'checkbox', reminder: { mode: 'daily', time: '09:00' } });
  processReminders(store, () => false, now); store.logProgress(habit.id, 1);
  processReminders(store, () => assert.fail('Completed habit should stay quiet'), now);
  assert.equal(store.snapshot().reminderQueue.length, 0);
  const second = store.addHabit({ name: 'Water', type: 'checkbox', reminder: { mode: 'daily', time: '09:00' } });
  processReminders(store, () => false, now); store.archiveHabit(second.id);
  processReminders(store, () => assert.fail('Removed habit should stay quiet'), now);
  const third = store.addHabit({ name: 'Walk', type: 'checkbox', reminder: { mode: 'daily', time: '09:00' } });
  processReminders(store, () => false, now); store.updateSettings({ remindersPaused: true });
  processReminders(store, () => assert.fail('Paused reminders should stay quiet'), now);
  assert.equal(store.snapshot().reminderQueue.length, 0);
  store.updateSettings({ remindersPaused: false });
  store.enqueueReminder(third.id, '2026-11-06:540');
  processReminders(store, () => assert.fail('Old reminders should not arrive late'), new Date(2026, 10, 6, 9, 16));
  assert.equal(store.snapshot().reminderQueue.length, 0);
});
