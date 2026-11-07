'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { RestClock, REST_AFTER } = require('../src/rest');
function setup() {
  let time = 0, nextId = 0;
  const timers = new Map(), changes = [];
  const clock = new RestClock({ now: () => time, onChange: rest => changes.push(rest.sleeping), schedule: (callback, wait) => { const id = ++nextId; timers.set(id, { callback, at: time + wait }); return id; }, cancel: id => timers.delete(id) });
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
