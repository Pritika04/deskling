'use strict';
window.BuddyTheme = {
  colors: { sage: '#789568', lavender: '#9582b4', peach: '#c58c70', ocean: '#67989f' },
  apply(settings) {
    const accent = settings.accent || this.colors[settings.palette] || this.colors.sage;
    document.documentElement.style.setProperty('--accent', accent);
    document.documentElement.style.setProperty('--soft', `color-mix(in srgb, ${accent} 32%, #f8f4ec)`);
  },
};
