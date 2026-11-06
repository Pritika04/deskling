'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { dueReminders } = require('../src/reminders');
function state(reminder) {
  return { settings: { remindersPaused: false, dayStartHour: 0 }, days: {}, reminderDeliveries: {}, habits: [{ id: 'a', name: 'Water', type: 'count', goal: 8, archived: false, reminder }] };
}
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
