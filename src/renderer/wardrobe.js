(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BuddyWardrobe = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const slots = { hat: 'Hats', eyes: 'Glasses', neck: 'Scarves & bows', hand: 'Umbrellas' };
  const catalog = [
    { id: 'daisy-crown', name: 'Daisy crown', slot: 'hat', price: 3, art: '<path d="M26 24Q50 9 75 24" fill="none" stroke="#829469" stroke-width="3"/><g fill="#f7edcd" stroke="#c8b784" stroke-width="1"><circle cx="31" cy="21" r="5"/><circle cx="43" cy="16" r="5"/><circle cx="57" cy="16" r="5"/><circle cx="70" cy="21" r="5"/></g><g fill="#d7ad50"><circle cx="31" cy="21" r="2"/><circle cx="43" cy="16" r="2"/><circle cx="57" cy="16" r="2"/><circle cx="70" cy="21" r="2"/></g>' },
    { id: 'berry-beret', name: 'Berry beret', slot: 'hat', price: 5, art: '<path d="M25 27Q20 12 43 10Q73 7 77 24Q64 33 25 27Z" fill="#c78d8c" stroke="#9b696d" stroke-width="1.5"/><path d="M48 10l3-6M29 28q22 7 43-1" fill="none" stroke="#9b696d" stroke-width="3" stroke-linecap="round"/>' },
    { id: 'sunny-bucket', name: 'Sunny bucket hat', slot: 'hat', price: 8, art: '<path d="M33 10Q50 6 68 10L74 30H27Z" fill="#e2c88d" stroke="#b59b67" stroke-width="1.5"/><path d="M25 27Q50 34 76 27L83 36Q50 46 18 36Z" fill="#ecd9a9" stroke="#b59b67" stroke-width="1.5"/><path d="M31 23Q50 29 71 23" fill="none" stroke="#bf9977" stroke-width="4"/>' },
    { id: 'moon-crown', name: 'Moonlight crown', slot: 'hat', price: 12, art: '<path d="m27 29-4-15 14 9L48 9q2-4 4 0l11 14 14-9-4 15Z" fill="#c6b5df" stroke="#8e7aa9" stroke-width="1.5"/><path d="M28 30h44" stroke="#8e7aa9" stroke-width="4" stroke-linecap="round"/><path d="M53 15a5 5 0 1 0 3 8 5 5 0 0 1-3-8" fill="#f1dc9a"/>' },
    { id: 'round-glasses', name: 'Bookworm glasses', slot: 'eyes', price: 3, art: '<g fill="none" stroke="#826c59" stroke-width="2"><circle cx="36" cy="52" r="10"/><circle cx="64" cy="52" r="10"/><path d="M46 51q4-3 8 0M26 49l-7-3m55 3 7-3"/></g>' },
    { id: 'heart-glasses', name: 'Heart eyes', slot: 'eyes', price: 7, art: '<path d="M36 61C15 49 25 35 36 44c11-9 21 5 0 17Zm28 0C43 49 53 35 64 44c11-9 21 5 0 17Z" fill="none" stroke="#b87891" stroke-width="2.5"/><path d="M47 49h6M25 46l-6-3m56 3 6-3" stroke="#b87891" stroke-width="2"/>' },
    { id: 'cozy-scarf', name: 'Cozy scarf', slot: 'neck', price: 4, art: '<path d="M22 73q28 12 56 0l-2 9q-26 11-52-1Z" fill="#c58c70" stroke="#a06f5a" stroke-width="1.3"/><path d="m61 81 12-2 4 15-12 1Z" fill="#d6a087" stroke="#a06f5a" stroke-width="1.3"/><path d="m65 91 10-2" stroke="#ead0b9" stroke-width="2"/>' },
    { id: 'little-bow', name: 'Little bow tie', slot: 'neck', price: 5, art: '<path d="M47 77Q31 64 32 76q-1 13 15 3m6-2q16-13 15-1 1 13-15 3" fill="#b49bc7" stroke="#8e77a5" stroke-width="1.5"/><rect x="46" y="73" width="8" height="9" rx="3" fill="#9c83b1"/>' },
    { id: 'rainy-umbrella', name: 'Rainy-day umbrella', slot: 'hand', price: 8, art: '<path d="M83 26v49q0 8-7 7" fill="none" stroke="#8e7a69" stroke-width="2.5" stroke-linecap="round"/><path d="M62 29q21-37 36 0-6-5-12 1-6-6-12 0-6-5-12-1Z" fill="#a8bcd0" stroke="#758fa7" stroke-width="1.4"/><path d="M83 10q-8 7-9 20m9-20q4 7 3 20" fill="none" stroke="#758fa7" stroke-width="1"/>' },
    { id: 'sunflower-parasol', name: 'Sunflower parasol', slot: 'hand', price: 12, art: '<path d="M82 27v50q0 7-6 6" fill="none" stroke="#96816a" stroke-width="2.5" stroke-linecap="round"/><path d="M61 29q21-36 37 0-6-5-12 1-6-6-12 0-6-5-13-1Z" fill="#e6ca84" stroke="#b59958" stroke-width="1.4"/><path d="M82 11q-7 8-8 19m8-19q5 8 4 19" fill="none" stroke="#b59958"/><circle cx="82" cy="17" r="4" fill="#f6e9b9"/><circle cx="82" cy="17" r="2" fill="#b59555"/>' },
  ];
  function accessoryMarkup(id) {
    const item = catalog.find(entry => entry.id === id);
    return item ? `<g data-accessory="${item.id}">${item.art}</g>` : '';
  }
  const bodies = {
    plant: '<g class="body-shape plant"><path d="M17 63C12 42 26 20 49 20C72 20 87 39 83 62C81 79 68 87 50 87C30 87 20 79 17 63Z" fill="var(--soft)" stroke="var(--accent)" stroke-width="2"/><path d="M47 21C43 9 52 6 61 9C61 17 55 22 47 21Z" fill="var(--accent)"/></g>',
    pineapple: '<g class="body-shape pineapple" fill="var(--soft)" stroke="var(--accent)" stroke-width="2"><path d="M34 29 25 11 44 21 49 5 57 21 76 10 66 31" fill="var(--accent)"/><path d="M50 26Q81 25 80 60Q81 88 50 87Q19 88 20 60Q19 26 50 26Z"/><path d="M25 40 75 75M23 60 56 85M43 28 78 53M75 40 25 75M77 60 44 85M57 28 22 53" fill="none" opacity=".18"/></g>',
    star: '<g class="body-shape star"><path d="M50 9Q53 8 56 17L66 35 87 39Q98 40 88 50L73 64 76 84Q78 95 67 89L50 80 32 89Q22 95 24 83L27 64 11 49Q3 40 15 38L35 35 44 17Q48 8 50 9Z" fill="var(--soft)" stroke="var(--accent)" stroke-width="2"/></g>',
  };
  function buddyMarkup(avatar, outfit = {}, animated = false) {
    const face = '<g id="face"><ellipse cx="32" cy="61" rx="7" ry="4" fill="#e5b8a9"/><ellipse cx="68" cy="61" rx="7" ry="4" fill="#e5b8a9"/><g stroke="#3d5140" stroke-width="4" stroke-linecap="round"><path class="eye eye-left" d="M36 49V54"/><path class="eye eye-right" d="M64 49V54"/></g><path class="mouth normal-mouth" d="M44 62Q50 68 56 62" fill="none" stroke="#3d5140" stroke-width="2.5" stroke-linecap="round"/>' + (animated ? '<path class="mouth happy-mouth" d="M43 62Q50 71 57 62" fill="none" stroke="#3d5140" stroke-width="3" stroke-linecap="round"/><path class="happy-eyes" d="M31 53Q36 46 41 53M59 53Q64 46 69 53" fill="none" stroke="#3d5140" stroke-width="3" stroke-linecap="round"/><ellipse class="mouth sleepy-mouth" cx="50" cy="65" rx="3" ry="4" fill="#3d5140"/>' : '') + '</g>';
    return (bodies[avatar] || bodies.plant) + face + ['neck', 'eyes', 'hand', 'hat'].map(slot => accessoryMarkup(outfit[slot])).join('');
  }
  function preview(avatar, outfit) {
    return `<svg viewBox="0 0 100 100" aria-hidden="true"><ellipse cx="50" cy="91" rx="29" ry="4" fill="#263f31" opacity=".1"/>${buddyMarkup(avatar, outfit)}</svg>`;
  }
  function icon(id) {
    const item = catalog.find(entry => entry.id === id);
    const boxes = { hat: '15 0 70 45', eyes: '16 33 68 36', neck: '20 63 60 37', hand: '55 0 48 95' };
    return item ? `<svg viewBox="${boxes[item.slot]}" aria-hidden="true">${accessoryMarkup(id)}</svg>` : '';
  }
  return { slots, catalog, accessoryMarkup, buddyMarkup, preview, icon };
});
