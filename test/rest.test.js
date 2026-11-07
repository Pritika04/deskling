'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { RestClock, REST_AFTER, DAY_REST_AFTER, restAfterFor } = require('../src/rest');
function setup(options = {}) {
  let time = 0, nextId = 0;
  const timers = new Map(), changes = [];
  const clock = new RestClock({ ...options, now: () => time, onChange: rest => changes.push(rest.sleeping), schedule: (callback, wait) => { const id = ++nextId; timers.set(id, { callback, at: time + wait }); return id; }, cancel: id => timers.delete(id) });
  return { clock, changes, timers, advance: duration => { time += duration; for (const [id, timer] of [...timers]) if (timer.at <= time) { timers.delete(id); timer.callback(); } } };
}

test('falls asleep after ten idle minutes and remains asleep until interaction', () => {
  const { clock, changes, advance, timers } = setup();
  advance(REST_AFTER - 1); assert.equal(clock.sleeping, false);
  advance(1); assert.equal(clock.sleeping, true);
  assert.deepEqual(changes, [true]); assert.equal(timers.size, 0);
  advance(REST_AFTER); clock.check(); assert.deepEqual(changes, [true]);
  clock.touch(); assert.equal(clock.sleeping, false);
  assert.deepEqual(changes, [true, false]); assert.equal(timers.size, 1);
});

test('real activity postpones the nap and repeated checks never count as activity', () => {
  const { clock, advance, timers } = setup();
  advance(5 * 60000); clock.touch();
  advance(5 * 60000); clock.check(); assert.equal(clock.sleeping, false);
  advance(5 * 60000); assert.equal(clock.sleeping, true);
  assert.equal(timers.size, 0);
});

test('temporary reactions and polling do not change the idle deadline', () => {
  const { clock, advance } = setup();
  advance(REST_AFTER); const last = clock.lastActivity;
  // A message wakes only the avatar animation; it never calls touch().
  clock.check(); advance(3000); clock.check();
  assert.equal(clock.lastActivity, last); assert.equal(clock.sleeping, true);
  clock.touch(); advance(REST_AFTER - 1); assert.equal(clock.sleeping, false);
});

test('a delayed timer after suspend catches up immediately and shutdown cancels it', () => {
  const { clock, advance, changes, timers } = setup();
  advance(60 * 60000); assert.equal(clock.sleeping, true); assert.deepEqual(changes, [true]);
  clock.touch(); clock.stop(); assert.equal(timers.size, 0);
  advance(60 * 60000); clock.check(); assert.deepEqual(changes, [true, false]);
});

test('daytime uses 45 minutes and night uses 10 minutes in local computer time', () => {
  for (const [hour, expected] of [[0, REST_AFTER], [5, REST_AFTER], [6, DAY_REST_AFTER], [12, DAY_REST_AFTER], [21, DAY_REST_AFTER], [22, REST_AFTER], [23, REST_AFTER]]) {
    assert.equal(restAfterFor(new Date(2026, 10, 7, hour)), expected);
  }
});

test('working in other apps keeps the buddy awake for hours, then it naps after 45 minutes away', () => {
  const { clock, advance } = setup({ idleMs: DAY_REST_AFTER });
  for (let index = 0; index < 72; index++) {
    advance(5 * 60000); clock.observeComputer(0); assert.equal(clock.sleeping, false);
  }
  advance(DAY_REST_AFTER - 1); assert.equal(clock.sleeping, false);
  advance(1); assert.equal(clock.sleeping, true);
  clock.observeComputer(0); assert.equal(clock.sleeping, false);
});

test('idle polling does not invent activity or keep the buddy awake', () => {
  const { clock, advance } = setup({ idleMs: DAY_REST_AFTER });
  advance(20 * 60000); clock.observeComputer(20 * 60000);
  advance(24 * 60000); clock.observeComputer(44 * 60000);
  assert.equal(clock.lastActivity, 0); assert.equal(clock.sleeping, false);
  advance(60000); clock.observeComputer(45 * 60000); assert.equal(clock.sleeping, true);
  clock.observeComputer(1000); assert.equal(clock.sleeping, false);
});

test('the day/night threshold updates without restarting the app', () => {
  let hour = 21;
  const { clock, advance } = setup({ idleMs: () => restAfterFor(new Date(2026, 10, 7, hour)) });
  advance(15 * 60000); assert.equal(clock.sleeping, false);
  hour = 22; clock.check(); assert.equal(clock.sleeping, true);
  clock.observeComputer(0); assert.equal(clock.sleeping, false);
  hour = 6;
  advance(11 * 60000); assert.equal(clock.sleeping, false);
  advance(34 * 60000); assert.equal(clock.sleeping, true);
});
