'use strict';

function nearbyGaze(cursor, buddy, enabled = true) {
  const centre = { x: buddy.x + buddy.width / 2, y: buddy.y + 5 + (buddy.height - 10) * .515 };
  const dx = cursor.x - centre.x, dy = cursor.y - centre.y;
  const distance = Math.hypot(dx, dy), radius = Math.max(175, buddy.width * 2);
  if (!enabled || distance === 0 || distance >= radius) return { x: 0, y: 0 };
  const fade = Math.min(1, (radius - distance) / (radius * .25));
  const strength = Math.min(1, distance / (buddy.width * .6)) * fade;
  const rounded = value => Math.round(value * 100) / 100 || 0;
  return { x: rounded(dx / distance * 2 * strength), y: rounded(dy / distance * 1.2 * strength) };
}
module.exports = { nearbyGaze };
