'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildProgress, period } = require('../src/renderer/progress');
const { Store } = require('../src/store');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const now = new Date(2026, 10, 12, 12);
const habit = (extra = {}) => ({ id: 'a', name: 'Water', type: 'count', goal: 8, unit: 'glasses', archived: false, createdDay: '2026-11-01', ...extra });
const state = (item = habit(), records = {}) => ({ habits: [item], settings: { dayStartHour: 0 }, days: Object.fromEntries(Object.entries(records).map(([day, amount]) => [day, [{ ...item, amount }]])) });

test('checkbox week shows which weekdays were completed, with future days separate', () => {
  const data = state(habit({ type: 'checkbox', goal: 1, unit: '', createdDay: '2026-11-09' }), { '2026-11-09': 1, '2026-11-10': 0, '2026-11-11': 1, '2026-11-12': 1 });
  const model = buildProgress(data, 'a', 'week', 0, now);
  assert.equal(model.start, '2026-11-09'); assert.equal(model.end, '2026-11-15');
  assert.equal(model.completed, 3); assert.equal(model.scheduled, 7);
  assert.deepEqual(model.points.map(point => point.value), [1, 0, 1, 1, null, null, null]);
  assert.equal(model.points.filter(point => point.future).length, 3);
});

test('new habits do not turn days before creation into missed or zero-average days', () => {
  const data = state(habit({ createdDay: '2026-11-11' }), { '2026-11-11': 8, '2026-11-12': 4 });
  const model = buildProgress(data, 'a', 'week', 0, now);
  assert.equal(model.eligible, 2); assert.equal(model.total, 12);
  assert.equal(model.points[0].untracked, true); assert.equal(model.points[1].untracked, true);
  assert.equal(model.previousAvailable, false); assert.ok(!model.insight.includes('higher'));
});

test('month exposes exact calendar days, including zero logs and separate future dates', () => {
  const model = buildProgress(state(habit(), { '2026-11-01': 8, '2026-11-08': 7, '2026-11-09': 8, '2026-11-12': 2 }), 'a', 'month', 0, now);
  assert.equal(model.points.length, 30);
  assert.equal(model.points[0].value, 8); assert.equal(model.points[1].value, 0);
  assert.equal(model.points[11].value, 2); assert.equal(model.total, 25);
  assert.equal(model.eligible, 12); assert.equal(model.guide, null);
  assert.equal(model.points.at(-1).future, true);
});

test('three months has three monthly summaries across year boundaries', () => {
  const data = state(habit({ createdDay: '2025-01-01' }), { '2025-11-01': 8, '2025-11-02': 4, '2025-12-15': 8, '2026-01-12': 5 });
  const model = buildProgress(data, 'a', 'quarter', 0, new Date(2026, 0, 12, 12));
  assert.equal(model.start, '2025-11-01'); assert.equal(model.end, '2026-01-31');
  assert.equal(model.points.length, 3);
  assert.deepEqual(model.points.map(point => point.total), [12, 8, 5]);
  assert.deepEqual(model.points.map(point => point.completed), [1, 1, 0]);
  assert.deepEqual(model.points.map(point => point.eligible), [30, 31, 12]);
  assert.deepEqual(model.points.map(point => point.consistency), [3, 3, 0]);
  assert.equal(model.total, 25);
  assert.deepEqual(period('2026-01-12', 'quarter', -1), { start: '2025-08-01', end: '2025-10-31' });
});

test('historical goals determine historical completion, without a misleading single goal line', () => {
  const data = state(habit(), { '2026-11-01': 4, '2026-11-12': 8 });
  data.days['2026-11-01'][0].goal = 4;
  const model = buildProgress(data, 'a', 'month', 0, now);
  assert.equal(model.completed, 2); assert.equal(model.guide, null);
});

test('tracking types and changed units are not mixed into the current chart', () => {
  const data = state(habit({ type: 'minutes', goal: 15, unit: '', createdDay: '2026-09-01' }), { '2026-10-01': 10, '2026-11-12': 15 });
  data.days['2026-09-01'] = [{ ...habit(), amount: 8 }];
  const model = buildProgress(data, 'a', 'quarter', 0, now);
  assert.equal(model.first, '2026-10-01'); assert.equal(model.unit, 'min'); assert.equal(model.formatChanged, true);
  assert.equal(model.points[0].untracked, true);
  const changedUnit = state(habit({ unit: 'pages' }), { '2026-11-01': 8, '2026-11-12': 10 });
  changedUnit.days['2026-11-01'][0].unit = 'glasses';
  assert.equal(buildProgress(changedUnit, 'a', 'month', 0, now).eligible, 1);
});

test('weekly and monthly highs identify their own exact saved day without invented units or averages', () => {
  const data = state(habit({ unit: '' }), { '2026-11-06': 8, '2026-11-07': 8, '2026-11-08': 8, '2026-11-11': 4, '2026-11-12': 3 });
  const week = buildProgress(data, 'a', 'week', 0, now), month = buildProgress(data, 'a', 'month', 0, now);
  assert.equal(week.total, 7); assert.equal(week.best.day, '2026-11-11'); assert.equal(week.best.amount, 4);
  assert.equal(month.total, 31); assert.equal(month.best.day, '2026-11-06'); assert.equal(month.best.amount, 8);
  assert.equal(month.points[5].value, 8); assert.equal(month.points[10].value, 4);
  assert.equal(month.insight, 'Best day: Nov 6 (8).');
  assert.equal(month.longestRun, 3);
  assert.equal(month.unit, ''); assert.doesNotMatch(month.insight, /times|average/);
  assert.equal(month.total, month.points.reduce((sum, point) => sum + point.total, 0));
});

test('monthly percentages use the full calendar month, even for a newly created habit', () => {
  const data = state(habit({ createdDay: '2026-11-06' }), { '2026-11-06': 8, '2026-11-07': 8, '2026-11-09': 8, '2026-11-10': 8, '2026-11-11': 8 });
  const model = buildProgress(data, 'a', 'quarter', 0, now);
  assert.equal(model.points[0].consistency, null);
  assert.equal(model.points[2].eligible, 7);
  assert.equal(model.points[2].consistency, 17);
  assert.equal(model.longestRun, 3);
});

test('three completed days in November is ten percent, with correct month lengths including leap years', () => {
  const november = state(habit({ createdDay: '2026-11-05' }), { '2026-11-05': 8, '2026-11-06': 8, '2026-11-07': 8 });
  assert.equal(buildProgress(november, 'a', 'quarter', 0, now).points[2].consistency, 10);
  for (const [year, month, days] of [[2026, 1, 31], [2026, 2, 28], [2028, 2, 29]]) {
    const key = `${year}-${String(month).padStart(2, '0')}-01`;
    const data = state(habit({ createdDay: key }), { [key]: 8 });
    const point = buildProgress(data, 'a', 'quarter', 0, new Date(year, month - 1, 2, 12)).points[2];
    assert.equal(point.consistency, Math.round(100 / days));
  }
});

test('legacy history starts at the first saved entry; deleted habits disappear; analysis is read-only', () => {
  const legacy = habit(); delete legacy.createdDay;
  const data = state(legacy, { '2026-11-10': 0, '2026-11-12': 8 }), before = JSON.stringify(data);
  assert.equal(buildProgress(data, 'a', 'month', 0, now).eligible, 3);
  assert.equal(JSON.stringify(data), before);
  data.habits[0].archived = true; assert.equal(buildProgress(data, 'a', 'week', 0, now), null);
});

test('habit-day rollover and daylight-saving boundaries keep seven local dates', () => {
  const data = state(habit({ createdDay: '2026-10-01' })); data.settings.dayStartHour = 4;
  assert.equal(buildProgress(data, 'a', 'week', 0, new Date(2026, 10, 9, 1)).today, '2026-11-08');
  assert.equal(period('2026-11-01', 'week', 0).start, '2026-10-26');
  assert.equal(buildProgress(data, 'a', 'week', 0, new Date(2026, 10, 1, 12)).points.length, 7);
});

test('creation date persists when a habit is edited and the store reopens', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deskling-progress-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'state.json'), options = { now: () => now };
  const store = new Store(file, options), item = store.addHabit({ name: 'Read', type: 'minutes', goal: 15 });
  assert.equal(item.createdDay, '2026-11-12');
  store.editHabit(item.id, { name: 'Read a little', type: 'minutes', goal: 20 });
  assert.equal(new Store(file, options).snapshot().habits[0].createdDay, '2026-11-12');
});
