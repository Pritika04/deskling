'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../src/store');
const { TreatQueue, TreatPicker, foods, treatMessages } = require('../src/treats');

function setup(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'buddy-treat-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let now = new Date(2026, 10, 7, 12);
  const file = path.join(directory, 'state.json');
  const options = { now: () => now };
  const store = new Store(file, options), queue = new TreatQueue();
  const habits = ['Read', 'Water', 'Stretch'].map(name => store.addHabit({ name, type: 'minutes', goal: 10 }));
  return { store, queue, habits, file, options, nextDay() { now = new Date(2026, 10, 8, 12); }, request() { return queue.request(store.snapshot(), now); }, take() { return queue.take(store.snapshot(), now); } };
}

test('a treat waits until requested after the celebration and is consumed once', t => {
  const f = setup(t);
  f.queue.record(f.store.logProgress(f.habits[0].id, 10));
  assert.equal(f.take(), null);
  assert.equal(f.request(), true);
  assert.deepEqual(f.take(), { size: 'small' });
  assert.equal(f.request(), false);
  assert.equal(f.take(), null);
});

test('the snack catalog has over 100 distinct foods with artwork and at least 60 reactions', () => {
  assert.ok(foods.length > 100);
  assert.equal(new Set(foods.map(food => food.id)).size, foods.length);
  assert.equal(new Set(foods.map(food => food.name)).size, foods.length);
  for (const food of foods) {
    assert.match(food.id, /^[a-z-]+$/);
    assert.ok(food.emoji && food.name && food.kind);
  }
  assert.ok(treatMessages.length >= 60);
  assert.equal(new Set(treatMessages).size, treatMessages.length);
});

test('every food and reaction appears once per shuffle cycle, without repeats at the boundary', () => {
  for (const random of [() => 0, () => 0.5, () => 0.999, Math.random]) {
    const picker = new TreatPicker(random);
    const foodIds = [], templates = [];
    for (let i = 0; i < foods.length * treatMessages.length; i++) {
      const { food, message } = picker.next();
      const template = treatMessages.find(text => text.replaceAll('{food}', food.name).replaceAll('{Food}', food.name[0].toUpperCase() + food.name.slice(1)) === message);
      assert.ok(template);
      assert.ok(!message.includes('{'));
      if (i) { assert.notEqual(food.id, foodIds.at(-1)); assert.notEqual(template, templates.at(-1)); }
      foodIds.push(food.id); templates.push(template);
      if ((i + 1) % foods.length === 0) assert.equal(new Set(foodIds.slice(-foods.length)).size, foods.length);
      if ((i + 1) % treatMessages.length === 0) assert.equal(new Set(templates.slice(-treatMessages.length)).size, treatMessages.length);
    }
  }
});

test('intermediate completions merge into one bigger snack', t => {
  const f = setup(t);
  for (const habit of f.habits.slice(0, 2)) f.queue.record(f.store.logProgress(habit.id, 10));
  f.request();
  assert.deepEqual(f.take(), { size: 'big' });
  assert.equal(f.take(), null);
});

test('the final completion clears queued snacks and keeps only the present', t => {
  const f = setup(t);
  for (const habit of f.habits) {
    const result = f.store.logProgress(habit.id, 10);
    f.queue.record(result);
    if (result.allComplete) assert.equal(result.treatEligible, false);
  }
  assert.equal(f.request(), false);
  assert.equal(f.take(), null);
});

test('correcting progress cannot earn another treat, including after restart; a new day can', t => {
  const f = setup(t), id = f.habits[0].id;
  assert.equal(f.store.logProgress(id, 10).treatEligible, true);
  const reopened = new Store(f.file, f.options);
  reopened.logProgress(id, 3, { replace: true });
  assert.equal(reopened.logProgress(id, 10, { replace: true }).treatEligible, false);
  f.nextDay();
  assert.equal(reopened.logProgress(id, 10).treatEligible, true);
});

test('removed, corrected, and previous-day completions leave no stale snacks', t => {
  const f = setup(t);
  const record = index => f.queue.record(f.store.logProgress(f.habits[index].id, 10));
  record(0); f.store.logProgress(f.habits[0].id, 2, { replace: true });
  assert.equal(f.request(), false);
  record(1); f.store.archiveHabit(f.habits[1].id);
  assert.equal(f.request(), false);
  // A third unfinished habit keeps this an intermediate completion.
  f.store.addHabit({ name: 'Breathe', type: 'checkbox' });
  record(2); f.nextDay();
  assert.equal(f.request(), false);
});
