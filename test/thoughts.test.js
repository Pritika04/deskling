'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../src/store');
const { tickThoughts, pool, thoughtDuration, jokeSequence } = require('../src/thoughts');
const { chooseSurprise } = require('../src/mystery');

test('thoughts wait, defer while busy or the computer is idle, respect pause, and persist their own bag', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'buddy-thought-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'state.json');
  const store = new Store(file);
  let now = new Date(2026, 10, 6, 12), delivered = [];
  const show = (item, check) => { if (!check) delivered.push(item); return true; };
  assert.equal(tickThoughts(store, show, now, () => 0), false);
  assert.equal(store.snapshot().thoughts.nextAt, now.getTime() + 30 * 60000);
  now = new Date(now.getTime() + 31 * 60000);
  assert.equal(tickThoughts(store, () => false, now, () => 0), false);
  assert.deepEqual(store.snapshot().thoughts.usedIds, []);
  store.updateSettings({ remindersPaused: true });
  assert.equal(tickThoughts(store, show, now, () => 0), false);
  store.updateSettings({ remindersPaused: false });
  assert.equal(tickThoughts(store, show, now, () => 0, false), false);
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

test('a shorter first wait and random 75–120-minute gaps survive restarts and midnight', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'buddy-thought-timing-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'state.json');
  let store = new Store(file);
  const morning = new Date(2026, 10, 6, 23);
  let delivered = 0;
  const show = (_item, check) => { if (!check) delivered++; return true; };
  tickThoughts(store, show, morning, () => .25);
  const firstDue = morning.getTime() + 37.5 * 60000;
  assert.equal(store.snapshot().thoughts.nextAt, firstDue);
  store = new Store(file);
  tickThoughts(store, show, new Date(morning.getTime() + 1000), () => .99);
  assert.equal(store.snapshot().thoughts.nextAt, firstDue);
  assert.equal(tickThoughts(store, show, new Date(firstDue), () => .75), true);
  assert.equal(store.snapshot().thoughts.nextAt, firstDue + 108.75 * 60000);
  const seen = store.snapshot().thoughts.usedIds;
  const midnight = new Date(2026, 10, 7, 0);
  assert.equal(tickThoughts(store, show, midnight, () => .1), false);
  assert.equal(store.snapshot().thoughts.nextAt, firstDue + 108.75 * 60000);
  assert.deepEqual(store.snapshot().thoughts.usedIds, seen);
  assert.equal(delivered, 1);
  assert.equal(tickThoughts(store, show, new Date(firstDue + 108.75 * 60000), () => .1), true);
  assert.equal(delivered, 2);
});

test('late-night work gets thoughts too, while time away from the computer does not consume them', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'buddy-thought-late-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new Store(path.join(directory, 'state.json'));
  let delivered = 0;
  const show = (_item, check) => { if (!check) delivered++; return true; };
  tickThoughts(store, show, new Date(2026, 10, 6, 20, 30), () => 0);
  assert.equal(tickThoughts(store, show, new Date(2026, 10, 6, 22, 30), () => 0), true);
  const before = store.snapshot().thoughts;
  assert.equal(tickThoughts(store, show, new Date(2026, 10, 7, 0, 31), () => 0, false), false);
  assert.deepEqual(store.snapshot().thoughts, before);
  assert.equal(tickThoughts(store, show, new Date(2026, 10, 7, 0, 32), () => 0), true);
  assert.equal(delivered, 2);
});

test('upgrade preserves an earlier deadline and content history without resetting on restart', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'buddy-thought-upgrade-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new Store(path.join(directory, 'state.json'));
  const now = new Date(2026, 10, 6, 12);
  store.saveThoughts({ usedIds: [pool[0].id], lastType: pool[0].type, day: '2026-11-06', nextAt: now.getTime() + 15 * 60000 });
  assert.equal(tickThoughts(store, () => true, now, () => .5), false);
  assert.equal(store.snapshot().thoughts.nextAt, now.getTime() + 15 * 60000);
  assert.deepEqual(store.snapshot().thoughts.usedIds, [pool[0].id]);
  tickThoughts(store, () => true, new Date(now.getTime() + 60000), () => 0);
  assert.equal(store.snapshot().thoughts.nextAt, now.getTime() + 15 * 60000);
});

test('six hours of active work gets three to five occasional thoughts, including playful ones', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'buddy-thought-workday-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new Store(path.join(directory, 'state.json'));
  const start = new Date(2026, 10, 6, 12).getTime(), times = [];
  let now, seed = 42; const types = [];
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let minute = 0; minute <= 360; minute++) {
    now = new Date(start + minute * 60000);
    tickThoughts(store, (item, check) => { if (!check) { times.push(now.getTime()); types.push(item.type); } return true; }, now, random);
  }
  assert.ok(times.length >= 3 && times.length <= 5);
  assert.ok(types.filter(type => ['joke', 'riddle', 'smile'].includes(type)).length >= 2);
  assert.ok(times[0] - start >= 30 * 60000 && times[0] - start <= 60 * 60000);
  const gaps = times.slice(1).map((time, index) => (time - times[index]) / 60000);
  assert.ok(gaps.every(gap => gap >= 75 && gap <= 120));
});

test('upgrading the two-to-three-hour schedule brings a distant thought closer and keeps overdue thoughts due', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'buddy-thought-v3-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new Store(path.join(directory, 'state.json'));
  const now = new Date(2026, 10, 6, 12);
  const history = { usedIds: [pool[0].id], lastType: pool[0].type, day: '2026-11-06', scheduleVersion: 2 };
  store.saveThoughts({ ...history, nextAt: now.getTime() + 180 * 60000 });
  tickThoughts(store, () => true, now, () => 0.5);
  assert.equal(store.snapshot().thoughts.nextAt, now.getTime() + 45 * 60000);
  assert.deepEqual(store.snapshot().thoughts.usedIds, history.usedIds);
  store.saveThoughts({ ...history, nextAt: now.getTime() - 60000 });
  tickThoughts(store, () => true, now, () => 0.5);
  assert.equal(store.snapshot().thoughts.nextAt, now.getTime() - 60000);
  assert.equal(tickThoughts(store, () => true, now, () => 0.5), true);
});

test('short thoughts stay six seconds, long jokes get more reading time, and duration is capped at twelve', () => {
  assert.equal(thoughtDuration('A little joke.'), 6000);
  assert.ok(thoughtDuration('x'.repeat(150)) > 6000);
  assert.equal(thoughtDuration('x'.repeat(1000)), 12000);
  for (const item of pool) {
    const duration = thoughtDuration(item.text + (item.answer || ''));
    assert.ok(duration >= 6000 && duration <= 12000);
  }
});

test('jokes and riddles separate the setup, three-second thinking pause, and readable laughing answer', () => {
  for (const item of pool.filter(item => ['joke', 'riddle'].includes(item.type) && item.answer)) {
    const before = structuredClone(item), sequence = jokeSequence(item);
    assert.equal(sequence.question, item.text);
    assert.equal(sequence.thinkingMs, 3000);
    assert.equal(sequence.punchline, `${item.answer.trim()} 😂`);
    assert.ok(sequence.answerMs >= 6000 && sequence.answerMs <= 12000);
    assert.deepEqual(item, before);
  }
});

test('ordinary thoughts and incomplete jokes do not create an empty punchline', () => {
  for (const item of [
    { type: 'smile', text: 'A little thought.' },
    { type: 'joke', text: 'A one-line joke.' },
    { type: 'riddle', text: 'A question?', answer: '  ' },
    { type: 'kindness', text: 'A little kindness.', answer: 'A note.' },
  ]) assert.equal(jokeSequence(item), null);
});
