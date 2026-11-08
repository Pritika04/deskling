'use strict';

function popupPosition(buddy, area, preferred, gap = 12) {
  const margin = 8;
  const left = area.x + margin, top = area.y + margin;
  const right = area.x + area.width - margin, bottom = area.y + area.height - margin;
  const width = Math.min(preferred.width, right - left);
  const height = Math.min(preferred.height, bottom - top);
  const regions = [
    { x: left, y: top, width: right - left, height: Math.max(0, buddy.y - gap - top), vertical: true, above: true },
    { x: left, y: buddy.y + buddy.height + gap, width: right - left, height: Math.max(0, bottom - buddy.y - buddy.height - gap), vertical: true },
    { x: buddy.x + buddy.width + gap, y: top, width: Math.max(0, right - buddy.x - buddy.width - gap), height: bottom - top },
    { x: left, y: top, width: Math.max(0, buddy.x - gap - left), height: bottom - top, before: true },
  ];
  // Prefer the full menu above/below, then beside the pet. If neither fits,
  // shorten the menu and let its content scroll instead of covering the pet.
  const region = regions.find(rect => rect.width >= width && rect.height >= height) ||
    regions.reduce((best, rect) => Math.min(rect.width, width) * Math.min(rect.height, height) > Math.min(best.width, width) * Math.min(best.height, height) ? rect : best);
  const result = { width: Math.min(width, region.width), height: Math.min(height, region.height) };
  result.x = region.vertical ? Math.max(left, Math.min(buddy.x, right - result.width)) : region.before ? region.x + region.width - result.width : region.x;
  result.y = region.vertical ? region.above ? region.y + region.height - result.height : region.y : Math.max(top, Math.min(buddy.y, bottom - result.height));
  return Object.fromEntries(Object.entries(result).map(([key, value]) => [key, Math.round(value)]));
}
function mouthPoint(buddy, ratio = .65) {
  return { x: buddy.x + buddy.width / 2, y: buddy.y + 5 + (buddy.height - 10) * ratio };
}

function bubbleTail(bubble, mouth) {
  const body = { x: bubble.x + 12, y: bubble.y + 12, width: bubble.width - 24, height: bubble.height - 24 };
  const dx = mouth.x - body.x - body.width / 2, dy = mouth.y - body.y - body.height / 2;
  const horizontal = Math.abs(dx) / body.width > Math.abs(dy) / body.height;
  const clamp = (value, start, length) => Math.max(start + Math.min(18, length / 2), Math.min(value, start + length - Math.min(18, length / 2)));
  const base = horizontal ? { x: dx < 0 ? body.x + 1 : body.x + body.width - 1, y: clamp(mouth.y, body.y, body.height) } :
    { x: clamp(mouth.x, body.x, body.width), y: dy < 0 ? body.y + 1 : body.y + body.height - 1 };
  const length = Math.hypot(base.x - mouth.x, base.y - mouth.y);
  // Point toward the mouth with a short arrow, leaving the pet untouched.
  const arrowLength = Math.min(8, Math.max(0, length - 6));
  const tip = { x: base.x + (mouth.x - base.x) / length * arrowLength, y: base.y + (mouth.y - base.y) / length * arrowLength };
  const a = { x: base.x - (horizontal ? 0 : 6), y: base.y - (horizontal ? 6 : 0) };
  const b = { x: base.x + (horizontal ? 0 : 6), y: base.y + (horizontal ? 6 : 0) };
  return { a, b, tip, length };
}

function crossesRect(start, end, rect) {
  let low = 0, high = 1;
  for (const [axis, length] of [['x', 'width'], ['y', 'height']]) {
    const delta = end[axis] - start[axis];
    if (Math.abs(delta) < .001) {
      if (start[axis] <= rect[axis] || start[axis] >= rect[axis] + rect[length]) return false;
    } else {
      const a = (rect[axis] - start[axis]) / delta, b = (rect[axis] + rect[length] - start[axis]) / delta;
      low = Math.max(low, Math.min(a, b)); high = Math.min(high, Math.max(a, b));
      if (low >= high) return false;
    }
  }
  return high > 0 && low < 1;
}

function bubblePosition(buddy, area, preferred, obstacles = [], mouth = mouthPoint(buddy)) {
  const overlaps = (a, b, gap = 0) => a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
  const clear = rect => !overlaps(rect, buddy) && obstacles.every(obstacle => !overlaps(rect, obstacle, 4));
  const fullWidth = Math.min(preferred.width, area.width - 16), height = Math.min(preferred.height, area.height - 16);
  const widths = [fullWidth, Math.min(140, fullWidth)];
  const candidates = [];
  for (const obstacle of obstacles) widths.push(Math.min(fullWidth, obstacle.x - area.x - 12), Math.min(fullWidth, area.x + area.width - obstacle.x - obstacle.width - 12));
  for (const width of [...new Set(widths)].filter(value => value >= Math.min(140, fullWidth)).sort((a, b) => b - a)) {
    const clampX = x => Math.max(area.x + 8, Math.min(x, area.x + area.width - width - 8));
    const clampY = y => Math.max(area.y + 8, Math.min(y, area.y + area.height - height - 8));
    const xs = [buddy.x, buddy.x - width, buddy.x + buddy.width, mouth.x - width / 2, area.x + 8, area.x + area.width - width - 8];
    const ys = [buddy.y - height, buddy.y + buddy.height, buddy.y, mouth.y - height / 2, area.y + 8, area.y + area.height - height - 8];
    for (const obstacle of obstacles) {
      xs.push(obstacle.x - width - 8, obstacle.x + obstacle.width + 8);
      ys.push(obstacle.y - height - 8, obstacle.y + obstacle.height + 8);
    }
    candidates.push(...xs.flatMap(x => ys.map(y => ({ x: Math.round(clampX(x)), y: Math.round(clampY(y)), width, height }))).filter(rect => {
      if (!clear(rect)) return false;
      const tail = bubbleTail(rect, mouth);
      return obstacles.every(obstacle => !crossesRect(tail.a, tail.tip, obstacle) && !crossesRect(tail.b, tail.tip, obstacle));
    }));
  }
  // A narrower bubble can sit beside the mouth when a wide one would be
  // pushed past the menu. Prefer a short tail, with a small wrapping penalty.
  const score = rect => bubbleTail(rect, mouth).length + (fullWidth - rect.width) * .15;
  candidates.sort((a, b) => score(a) - score(b));
  return candidates[0] || null;
}

function bubbleLayout(buddy, area, preferred, obstacles = [], mouth = mouthPoint(buddy)) {
  const bubble = bubblePosition(buddy, area, preferred, obstacles, mouth);
  if (!bubble) return null;
  const tail = bubbleTail(bubble, mouth);
  const x = Math.floor(Math.min(bubble.x, tail.tip.x - 8)), y = Math.floor(Math.min(bubble.y, tail.tip.y - 8));
  const frame = { x, y, width: Math.ceil(Math.max(bubble.x + bubble.width, tail.tip.x + 8) - x), height: Math.ceil(Math.max(bubble.y + bubble.height, tail.tip.y + 8) - y) };
  return { bubble, tail, mouth, frame };
}

function bubbleWithMenu(buddy, area, preferred, menu = null, mouth = mouthPoint(buddy)) {
  let best = bubbleLayout(buddy, area, preferred, menu ? [menu] : [], mouth);
  if (!menu || (best && best.tail.length <= Math.max(96, buddy.width * .8))) return best && { ...best, menu };
  let bestMenu = menu;
  // Leave room beside the face by placing a shorter, scrollable menu above
  // or below the pet when a full-height menu would push speech far away.
  const bandHeight = Math.min(preferred.height, area.height - 16);
  const bandTop = Math.floor(Math.max(area.y + 8, Math.min(mouth.y - bandHeight / 2, area.y + area.height - bandHeight - 8)));
  const aboveBottom = Math.min(buddy.y - 12, bandTop - 8);
  const belowTop = Math.max(buddy.y + buddy.height + 12, bandTop + bandHeight + 8);
  const regions = [{ top: area.y + 8, bottom: aboveBottom, above: true }, { top: belowTop, bottom: area.y + area.height - 8 }];
  for (const region of regions) {
    const available = Math.floor(region.bottom - region.top);
    if (available < 160) continue;
    const height = Math.min(menu.height, available);
    const nextMenu = { x: Math.max(area.x + 8, Math.min(buddy.x, area.x + area.width - menu.width - 8)), y: region.above ? region.bottom - height : region.top, width: menu.width, height };
    const next = bubbleLayout(buddy, area, preferred, [nextMenu], mouth);
    if (next && (!best || next.tail.length + 8 < best.tail.length)) { best = next; bestMenu = nextMenu; }
  }
  return best && { ...best, menu: bestMenu };
}
function shouldRestorePopup(requested, startedAt, idleSeconds, now = Date.now()) {
  if (!requested || !Number.isFinite(startedAt) || !Number.isFinite(idleSeconds) || idleSeconds < 0 || now < startedAt) return false;
  // OS idle time is rounded to whole seconds. Restore only if the user has
  // stayed idle since completing the habit, rather than resumed other work.
  return idleSeconds * 1000 + 1000 >= now - startedAt;
}
module.exports = { popupPosition, bubblePosition, bubbleLayout, bubbleWithMenu, mouthPoint, shouldRestorePopup };
