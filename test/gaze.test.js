'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { nearbyGaze } = require('../src/gaze');
const buddy = { x: 100, y: 100, width: 100, height: 100 };
const centre = { x: 150, y: 151.35 };

test('glances toward nearby cursor positions with a small bounded eye shift', () => {
  assert.ok(nearbyGaze({ x: 220, y: centre.y }, buddy).x > 0);
  assert.ok(nearbyGaze({ x: 80, y: centre.y }, buddy).x < 0);
  assert.ok(nearbyGaze({ x: centre.x, y: 80 }, buddy).y < 0);
  assert.ok(nearbyGaze({ x: centre.x, y: 220 }, buddy).y > 0);
  for (let x = -200; x <= 400; x += 10) for (let y = -200; y <= 400; y += 10) {
    const gaze = nearbyGaze({ x, y }, buddy);
    assert.ok(Math.abs(gaze.x) <= 2 && Math.abs(gaze.y) <= 1.2);
  }
});

test('distant cursors, disabled tracking, and the exact face centre all return neutral eyes', () => {
  assert.deepEqual(nearbyGaze({ x: 1000, y: 1000 }, buddy), { x: 0, y: 0 });
  assert.deepEqual(nearbyGaze({ x: 220, y: 150 }, buddy, false), { x: 0, y: 0 });
  assert.deepEqual(nearbyGaze(centre, buddy), { x: 0, y: 0 });
});

test('gaze fades gently at the edge of the nearby area', () => {
  const near = nearbyGaze({ x: 250, y: centre.y }, buddy);
  const edge = nearbyGaze({ x: 349, y: centre.y }, buddy);
  assert.ok(near.x > edge.x && edge.x > 0);
  assert.deepEqual(nearbyGaze({ x: 350, y: centre.y }, buddy), { x: 0, y: 0 });
});

test('uses local pet geometry at every size and on monitors with negative coordinates', () => {
  for (const size of [68, 160, 192]) {
    const pet = { x: 100, y: 100, width: size, height: size };
    const point = { x: 100 + size + 20, y: 105 + (size - 10) * .515 };
    const gaze = nearbyGaze(point, pet);
    assert.ok(gaze.x > 0); assert.equal(gaze.y, 0);
    assert.deepEqual(nearbyGaze({ x: point.x - 1500, y: point.y - 400 }, { ...pet, x: pet.x - 1500, y: pet.y - 400 }), gaze);
  }
});
