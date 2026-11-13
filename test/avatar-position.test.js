'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { avatarMovementArea, clampToArea } = require('../src/avatar-position');

const bounds = { x: 0, y: 0, width: 1440, height: 900 };
test('Mac buddy can reach the bottom of the screen below the Dock work area', () => {
  const display = { bounds, workArea: { x: 0, y: 25, width: 1440, height: 795 } };
  const area = avatarMovementArea(display, 'darwin');
  assert.deepEqual(clampToArea({ x: 400, y: 1000 }, 68, 68, area), { x: 400, y: 832 });
  assert.equal(clampToArea({ x: 400, y: -10 }, 68, 68, area).y, 25);
});
test('Mac side Docks do not reserve a strip that blocks the buddy', () => {
  for (const workArea of [{ x: 80, y: 25, width: 1360, height: 875 }, { x: 0, y: 25, width: 1360, height: 875 }]) {
    const area = avatarMovementArea({ bounds, workArea }, 'darwin');
    assert.equal(clampToArea({ x: -100, y: 400 }, 68, 68, area).x, 0);
    assert.equal(clampToArea({ x: 1600, y: 400 }, 68, 68, area).x, 1372);
  }
});
test('Mac screen coordinates support monitors to the left and above the primary screen', () => {
  const display = { bounds: { x: -1440, y: -900, width: 1440, height: 900 }, workArea: { x: -1440, y: -875, width: 1440, height: 795 } };
  assert.deepEqual(clampToArea({ x: -2000, y: 200 }, 160, 160, avatarMovementArea(display, 'darwin')), { x: -1440, y: -160 });
});
test('Windows and Linux retain their taskbar work-area limits', () => {
  const display = { bounds, workArea: { x: 0, y: 0, width: 1440, height: 850 } };
  for (const platform of ['win32', 'linux']) {
    assert.deepEqual(avatarMovementArea(display, platform), display.workArea);
    assert.equal(clampToArea({ x: 400, y: 1000 }, 68, 68, avatarMovementArea(display, platform)).y, 782);
  }
});
