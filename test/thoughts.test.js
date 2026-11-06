'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../src/store');
const { tickThoughts, pool } = require('../src/thoughts');
const { chooseSurprise } = require('../src/mystery');

test('daytime thoughts wait, defer while busy, respect quiet hours and pause, and persist their own bag', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'buddy-thought-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'state.json');
  const store = new Store(file);
  let now = new Date(2026, 10, 6, 12), delivered = [];
  const show = (item, check) => { if (!check) delivered.push(item); return true; };
  assert.equal(tickThoughts(store, show, now, () => 0), false);
  assert.equal(store.snapshot().thoughts.nextAt, now.getTime() + 30 * 60000);
  now = new Date(now.getTime() + 46 * 60000);
  assert.equal(tickThoughts(store, () => false, now, () => 0), false);
  assert.deepEqual(store.snapshot().thoughts.usedIds, []);
  store.updateSettings({ remindersPaused: true });
  assert.equal(tickThoughts(store, show, now, () => 0), false);
  store.updateSettings({ remindersPaused: false });
  assert.equal(tickThoughts(store, show, new Date(2026, 10, 6, 23), () => 0), false);
  assert.equal(tickThoughts(store, show, now, () => 0), true);
  assert.equal(delivered.length, 1);
  assert.deepEqual(new Store(file).snapshot().thoughts, store.snapshot().thoughts);
  assert.deepEqual(store.snapshot().mystery.usedIds, []);
  assert.equal(tickThoughts(store, show, now, () => 0), false);
});

test('daytime pool uses every selected item before repeating', () => {
  let history = { usedIds: [], lastType: null }, seen = new Set();
  for (let index = 0; index < pool.length; index++) {
    history = chooseSurprise(history, () => .4, pool);
    assert.equal(seen.has(history.item.id), false); seen.add(history.item.id);
  }
  assert.equal(seen.size, pool.length);
});

test('gaps vary per thought, survive same-day restarts, and start fresh tomorrow without repeating content', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'buddy-thought-timing-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'state.json');
  let store = new Store(file);
  const morning = new Date(2026, 10, 6, 8);
  let delivered = 0;
  const show = (_item, check) => { if (!check) delivered++; return true; };
  tickThoughts(store, show, morning, () => .25);
  const firstDue = morning.getTime() + 60 * 60000;
  assert.equal(store.snapshot().thoughts.nextAt, firstDue);
  store = new Store(file);
  tickThoughts(store, show, new Date(morning.getTime() + 1000), () => .99);
  assert.equal(store.snapshot().thoughts.nextAt, firstDue);
  assert.equal(tickThoughts(store, show, new Date(firstDue), () => .75), true);
  assert.equal(store.snapshot().thoughts.nextAt, firstDue + 120 * 60000);
  const seen = store.snapshot().thoughts.usedIds;
  const tomorrow = new Date(2026, 10, 7, 8);
  assert.equal(tickThoughts(store, show, tomorrow, () => .1), false);
  assert.equal(store.snapshot().thoughts.nextAt, tomorrow.getTime() + 42 * 60000);
  assert.deepEqual(store.snapshot().thoughts.usedIds, seen);
  assert.equal(delivered, 1);
});
