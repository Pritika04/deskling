'use strict';

function avatarMovementArea(display, platform = process.platform) {
  if (platform !== 'darwin') return display.workArea;
  // The Dock can sit at the bottom or either side. Keep the menu-bar inset,
  // but let the pet use the rest of the physical screen, including Dock space.
  const { bounds, workArea } = display;
  const top = Math.max(bounds.y, workArea.y);
  return { x: bounds.x, y: top, width: bounds.width, height: bounds.y + bounds.height - top };
}

function clampToArea(position, width, height, area) {
  return {
    x: Math.round(Math.max(area.x, Math.min(position.x, area.x + Math.max(0, area.width - width)))),
    y: Math.round(Math.max(area.y, Math.min(position.y, area.y + Math.max(0, area.height - height)))),
  };
}

module.exports = { avatarMovementArea, clampToArea };
