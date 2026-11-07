'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { popupPosition, bubbleWithMenu, mouthPoint } = require('../src/popup-position');
const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

test('menus stay within the monitor and never cover the pet, including tall menus in the middle of the screen', () => {
  for (const area of [{ x: 0, y: 0, width: 1280, height: 720 }, { x: -1440, y: -300, width: 1440, height: 900 }, { x: 0, y: 0, width: 800, height: 600 }]) {
    for (const size of [68, 160]) for (const xRatio of [0, .25, .5, .75, 1]) for (const yRatio of [0, .25, .5, .75, 1]) for (const height of [220, 340, 620]) {
      const buddy = { x: area.x + Math.round((area.width - size) * xRatio), y: area.y + Math.round((area.height - size) * yRatio), width: size, height: size };
      const menu = popupPosition(buddy, area, { width: 380, height });
      assert.equal(overlaps(menu, buddy), false, JSON.stringify({ buddy, menu, area }));
      assert.ok(menu.x >= area.x && menu.y >= area.y);
      assert.ok(menu.x + menu.width <= area.x + area.width && menu.y + menu.height <= area.y + area.height);
      assert.ok(menu.width > 0 && menu.height > 0);
    }
  }
});

test('uses the full menu beside the pet when vertical space is insufficient', () => {
  const menu = popupPosition({ x: 400, y: 320, width: 68, height: 68 }, { x: 0, y: 0, width: 1280, height: 720 }, { width: 380, height: 620 });
  assert.equal(menu.x, 480);
  assert.equal(menu.height, 620);
});

test('shortens the menu when a full menu cannot fit on any side', () => {
  const buddy = { x: 316, y: 266, width: 160, height: 160 };
  const menu = popupPosition(buddy, { x: 0, y: 0, width: 800, height: 600 }, { width: 380, height: 620 });
  assert.equal(overlaps(menu, buddy), false);
  assert.ok(menu.height < 620 || menu.width < 380);
});

test('bubbles stay clear of both the pet and the open habit menu across monitors and pet sizes', () => {
  for (const area of [{ x: 0, y: 0, width: 800, height: 600 }, { x: -1440, y: -300, width: 1440, height: 900 }]) {
    for (const size of [68, 160, 192]) for (const x of [0, .25, .5, .75, 1]) for (const y of [0, .25, .5, .75, 1]) {
      const pet = { x: area.x + Math.round((area.width - size) * x), y: area.y + Math.round((area.height - size) * y), width: size, height: size };
      const menu = popupPosition(pet, area, { width: 380, height: 620 });
      const layout = bubbleWithMenu(pet, area, { width: 274, height: 100 }, menu);
      assert.ok(layout, JSON.stringify({ pet, menu, area }));
      const { bubble, tail, mouth, frame } = layout;
      assert.equal(overlaps(bubble, pet), false);
      assert.equal(overlaps(bubble, layout.menu), false);
      assert.ok(bubble.x >= area.x && bubble.y >= area.y);
      assert.ok(bubble.x + bubble.width <= area.x + area.width && bubble.y + bubble.height <= area.y + area.height);
      const base = { x: (tail.a.x + tail.b.x) / 2, y: (tail.a.y + tail.b.y) / 2 };
      assert.ok(Math.abs(Math.hypot(tail.tip.x - base.x, tail.tip.y - base.y) - 8) < .01);
      assert.ok(tail.tip.x <= pet.x - 4 || tail.tip.x >= pet.x + pet.width + 4 || tail.tip.y <= pet.y - 4 || tail.tip.y >= pet.y + pet.height + 4);
      assert.ok(tail.length < Math.max(100, size * .8), `Speech must stay near the mouth: ${tail.length}`);
      assert.ok(frame.x >= area.x && frame.y >= area.y);
      assert.ok(frame.x + frame.width <= area.x + area.width && frame.y + frame.height <= area.y + area.height);
      for (const start of [tail.a, tail.b]) for (let step = 0; step <= 50; step++) {
        const x = start.x + (tail.tip.x - start.x) * step / 50, y = start.y + (tail.tip.y - start.y) * step / 50;
        assert.equal(x > layout.menu.x && x < layout.menu.x + layout.menu.width && y > layout.menu.y && y < layout.menu.y + layout.menu.height, false, 'Tail must not cross the menu');
      }
    }
  }
});

test('a tall menu makes room near the mouth instead of pushing speech far away', () => {
  const pet = { x: 20, y: 632, width: 68, height: 68 }, area = { x: 0, y: 0, width: 1280, height: 720 };
  const menu = popupPosition(pet, area, { width: 380, height: 620 });
  const layout = bubbleWithMenu(pet, area, { width: 220, height: 85 }, menu);
  assert.ok(layout);
  assert.ok(layout.tail.length < 96);
  assert.ok(layout.menu.height < menu.height);
  assert.equal(overlaps(layout.bubble, layout.menu), false);
  assert.deepEqual(layout.mouth, mouthPoint(pet));
});
