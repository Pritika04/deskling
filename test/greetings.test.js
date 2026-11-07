'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chooseGreeting, giftSize, chooseEncouragement, encouragements } = require('../src/greetings');

test('greetings follow local computer time at morning, afternoon, evening and night boundaries', () => {
  for (const [hour, period] of [[0, 'night'], [5, 'night'], [6, 'morning'], [11, 'morning'], [12, 'afternoon'], [16, 'afternoon'], [17, 'evening'], [21, 'evening'], [22, 'night'], [23, 'night']]) {
    const greeting = chooseGreeting(new Date(2026, 10, 6, hour), '', () => 0);
    assert.equal(greeting.period, period);
    assert.ok(greeting.text.length);
  }
});

test('greetings vary within the current time period and avoid repeating the previous message', () => {
  const now = new Date(2026, 10, 6, 14);
  const first = chooseGreeting(now, '', () => 0);
  assert.notEqual(chooseGreeting(now, first.text, () => 0).text, first.text);
  assert.notEqual(chooseGreeting(now, '', () => .99).text, first.text);
});

test('present boost is modest, including at the largest user size', () => {
  assert.equal(giftSize(68), 82);
  assert.equal(giftSize(160), 192);
});

test('halfway encouragements vary and never repeat the previous phrase', () => {
  assert.ok(encouragements.includes('Keep it going!'));
  const first = chooseEncouragement('', () => 0);
  assert.notEqual(chooseEncouragement(first, () => 0), first);
  assert.notEqual(chooseEncouragement('', () => .99), first);
});
