'use strict';
const { catalog, slots } = require('./renderer/wardrobe');
const { summary, localDay, shiftDay } = require('./renderer/domain');
function initialCollection() {
  return { coins: 0, owned: [], equipped: Object.fromEntries(Object.keys(slots).map(slot => [slot, null])), rewardedDays: [], milestones: [], months: [] };
}
function validateOutfit(outfit, owned) {
  if (!outfit || Object.keys(outfit).length !== Object.keys(slots).length || Object.keys(outfit).some(slot => !Object.hasOwn(slots, slot))) throw new Error('Choose an outfit from your wardrobe.');
  for (const slot of Object.keys(slots)) {
    const id = outfit[slot];
    if (id !== null && (!owned.includes(id) || !catalog.some(item => item.id === id && item.slot === slot))) throw new Error('You can only wear accessories you own in their matching slot.');
  }
}
function validateCollection(collection) {
  if (!collection || !Number.isSafeInteger(collection.coins) || collection.coins < 0 || !Array.isArray(collection.owned) || collection.owned.some(id => !catalog.some(item => item.id === id)) || new Set(collection.owned).size !== collection.owned.length) throw new Error('Invalid coin balance or wardrobe.');
  for (const [key, pattern] of [['rewardedDays', /^\d{4}-\d{2}-\d{2}$/], ['months', /^\d{4}-\d{2}$/], ['milestones', /^\d{4}-\d{2}-\d{2}:(3|10|30)$/]]) {
    if (!Array.isArray(collection[key]) || collection[key].some(value => typeof value !== 'string' || !pattern.test(value)) || new Set(collection[key]).size !== collection[key].length) throw new Error('Invalid coin reward history.');
  }
  validateOutfit(collection.equipped, collection.owned);
}
function accrueCoins(state, now) {
  if (!state.settings.hatched) return false;
  const collection = state.collection, today = localDay(now, state.settings.dayStartHour), month = today.slice(0, 7);
  let changed = false;
  if (!collection.months.includes(month)) { collection.months.push(month); collection.coins++; changed = true; }
  const progress = summary(state, now);
  if (!progress.allComplete) return changed;
  if (!collection.rewardedDays.includes(today)) { collection.rewardedDays.push(today); collection.coins++; changed = true; }
  const start = shiftDay(today, 1 - progress.current);
  for (const milestone of [3, 10, 30]) {
    const key = `${start}:${milestone}`;
    if (progress.current >= milestone && !collection.milestones.includes(key)) { collection.milestones.push(key); collection.coins += 5; changed = true; }
  }
  return changed;
}
module.exports = { initialCollection, validateCollection, validateOutfit, accrueCoins };
