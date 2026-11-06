'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { summary, daySummary, shiftDay, calendar, orderedHabits } = require('../src/renderer/domain');
const entry = (amount = 1) => ({ id: 'a', name: 'Rest', type: 'checkbox', goal: 1, amount, archived: false });

test('empty days are never completed; any progress gives a light shade', () => {
  assert.equal(daySummary([]).allComplete, false);
  assert.equal(daySummary([{ ...entry(0.5), goal: 8 }]).level, 1);
  assert.equal(daySummary([entry()]).level, 4);
  assert.equal(daySummary([{ ...entry(0.5), archived: true }]).allComplete, false);
});
test('streak carries yesterday while today is unfinished and records best across gaps', () => {
  const state = { settings: { dayStartHour: 0 }, habits: [entry()], days: {
    '2026-11-01': [entry()], '2026-11-02': [entry()], '2026-11-04': [entry()], '2026-11-05': [entry()],
  } };
  let data = summary(state, new Date(2026, 10, 6, 12));
  assert.equal(data.current, 2); assert.equal(data.best, 2);
  state.days['2026-11-06'] = [entry()];
  data = summary(state, new Date(2026, 10, 6, 12));
  assert.equal(data.current, 3); assert.equal(data.best, 3);
  assert.equal(summary(state, new Date(2026, 10, 8, 12)).current, 0);
});
test('month calendar includes every date, aligns weeks, and respects rollover', () => {
  const state = { settings: { dayStartHour: 4 }, habits: [], days: {} };
  const data = calendar(state, 'month', new Date(2026, 0, 1, 2));
  assert.equal(data.today, '2025-12-31');
  assert.equal(data.cells.filter(day => !day.outside).length, 31);
  assert.equal(new Date(`${data.cells[0].day}T12:00:00`).getDay(), 0);
  assert.ok(data.cells.some(day => day.day === data.today));
  assert.ok(data.cells.filter(day => day.day > data.today).every(day => day.future));
  assert.equal(shiftDay('2026-03-08', 1), '2026-03-09');
});
test('year calendar includes leap day and every month; future days are distinct', () => {
  const state = { settings: { dayStartHour: 0 }, habits: [], days: {} };
  const data = calendar(state, 'year', new Date(2024, 1, 29, 12));
  assert.equal(data.cells.filter(day => !day.outside).length, 366);
  assert.ok(data.cells.some(day => day.day === '2024-02-29' && !day.future));
  assert.ok(data.cells.some(day => day.day === '2024-12-31' && day.future && !day.outside));
  assert.equal(data.cells.length % 7, 0);
});

test('completed habits move below unfinished habits without changing the saved order, then reset tomorrow', () => {
  const habits = ['water', 'reading', 'rest'].map(id => ({ ...entry(), id, name: id }));
  const state = { settings: { dayStartHour: 0 }, habits, days: { '2026-11-06': [{ ...habits[0], amount: 1 }, { ...habits[1], amount: 0 }, { ...habits[2], amount: 1 }] } };
  const before = structuredClone(state);
  assert.deepEqual(orderedHabits(state, new Date(2026, 10, 6, 23, 59)).map(habit => habit.id), ['reading', 'water', 'rest']);
  assert.deepEqual(state, before);
  assert.deepEqual(orderedHabits(state, new Date(2026, 10, 7, 0, 1)).map(habit => habit.id), ['water', 'reading', 'rest']);
  state.habits = [habits[2], habits[1], habits[0]];
  assert.deepEqual(orderedHabits(state, new Date(2026, 10, 7, 0, 1)).map(habit => habit.id), ['rest', 'reading', 'water']);
  state.days['2026-11-06'][0].amount = 0;
  assert.deepEqual(orderedHabits(state, new Date(2026, 10, 6, 12)).map(habit => habit.id), ['reading', 'water', 'rest']);
});
