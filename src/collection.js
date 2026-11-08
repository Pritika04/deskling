'use strict';
const { catalog, slots } = require('./renderer/wardrobe');
const { summary, localDay, shiftDay, milestoneBonus, milestoneDays } = require('./renderer/domain');
function initialCollection() {
  return { economyVersion: 3, coins: 0, owned: [], equipped: Object.fromEntries(Object.keys(slots).map(slot => [slot, null])), rewardedDays: [], milestones: [], earnings: [], repairs: [], graceNotices: [] };
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
  for (const [key, pattern] of [['rewardedDays', /^\d{4}-\d{2}-\d{2}$/], ['milestones', /^\d{4}-\d{2}-\d{2}:\d+$/]]) {
    if (!Array.isArray(collection[key]) || collection[key].some(value => typeof value !== 'string' || !pattern.test(value)) || new Set(collection[key]).size !== collection[key].length) throw new Error('Invalid coin reward history.');
  }
  validateOutfit(collection.equipped, collection.owned);
  if (collection.legacyMilestones !== undefined && (!Array.isArray(collection.legacyMilestones) || collection.legacyMilestones.some(key => typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}:\d+$/.test(key)))) throw new Error('Invalid legacy coin history.');
  if (collection.earnings !== undefined) {
    if (!Array.isArray(collection.earnings) || new Set(collection.earnings.map(reward => reward?.id)).size !== collection.earnings.length || collection.earnings.some(reward => !reward || typeof reward.id !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(reward.day) || !['daily', 'monthly', 'streak'].includes(reward.kind) || !reward.id.startsWith(reward.kind + ':') || !Number.isSafeInteger(reward.coins) || reward.coins < 1 || (collection.economyVersion === 3 && (reward.kind === 'monthly' || reward.coins !== (reward.kind === 'streak' ? milestoneBonus(reward.streak) : 1))))) throw new Error('Invalid coin earning history.');
  }
  if (collection.economyVersion !== undefined && ![2, 3].includes(collection.economyVersion)) throw new Error('Unsupported coin rules.');
  const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (collection.repairs !== undefined && (!Array.isArray(collection.repairs) || collection.repairs.some(item => !item || typeof item.id !== 'string' || !date(item.from) || !date(item.through) || item.from > item.through || !date(item.boughtOn)) || new Set(collection.repairs.map(item => item.id)).size !== collection.repairs.length)) throw new Error('Invalid streak repairs.');
  if (collection.graceNotices !== undefined && (!Array.isArray(collection.graceNotices) || collection.graceNotices.some(day => !date(day)))) throw new Error('Invalid grace notices.');
}
function migrateEconomy(state, now) {
  const collection = state.collection;
  if (collection.economyVersion === 3) return false;
  const previousVersion = collection.economyVersion;
  const knownMilestones = collection.legacyMilestones || (previousVersion === undefined ? [...collection.milestones] : []);
  if (previousVersion === undefined) {
    const progress = summary(state, now);
    // Keep balances and purchases; upgrading never pays reached milestones again.
    if (progress.streakStart) for (const day of milestoneDays(progress.current)) {
      const key = `${progress.streakStart}:${day}`;
      if (!collection.milestones.includes(key)) collection.milestones.push(key);
    }
  }
  collection.earnings = (collection.earnings || []).filter(reward => reward.kind === 'daily' || (reward.kind === 'streak' && milestoneBonus(reward.streak))).map(reward => ({ ...reward, coins: reward.kind === 'streak' ? milestoneBonus(reward.streak) : 1 }));
  const ids = new Set(collection.earnings.map(reward => reward.id));
  for (const key of knownMilestones) {
    const [start, count] = key.split(':'), streak = Number(count), id = `streak:${key}`;
    if (!ids.has(id) && milestoneBonus(streak)) {
      collection.earnings.push({ id, kind: 'streak', day: shiftDay(start, streak - 1), streak, coins: milestoneBonus(streak) });
      ids.add(id);
    }
  }
  delete collection.legacyMilestones; delete collection.months;
  collection.economyVersion = 3; collection.repairs ||= []; collection.graceNotices ||= [];
  return true;
}
function accrueCoins(state, now) {
  if (!state.settings.hatched) return false;
  const collection = state.collection, today = localDay(now, state.settings.dayStartHour);
  let changed = migrateEconomy(state, now);
  const credit = (id, kind, coins, details = {}) => {
    collection.coins += coins;
    (collection.earnings ||= []).push({ id, day: today, kind, coins, ...details });
    changed = true;
  };
  const progress = summary(state, now);
  if (!progress.allComplete) return changed;
  if (!collection.rewardedDays.includes(today)) { collection.rewardedDays.push(today); credit(`daily:${today}`, 'daily', 1); }
  const start = progress.streakStart;
  for (const milestone of milestoneDays(progress.current)) {
    const key = `${start}:${milestone}`;
    if (!collection.milestones.includes(key)) { collection.milestones.push(key); credit(`streak:${key}`, 'streak', milestoneBonus(milestone), { streak: milestone }); }
  }
  return changed;
}
module.exports = { initialCollection, validateCollection, validateOutfit, accrueCoins, migrateEconomy };
