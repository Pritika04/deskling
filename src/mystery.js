'use strict';
const pool = require('../content/mystery.json');

function chooseSurprise(history, random = Math.random, items = pool) {
  const pool = items;
  let usedIds = history.usedIds.filter(id => pool.some(item => item.id === id));
  let unused = pool.filter(item => !usedIds.includes(item.id));
  if (!unused.length) { usedIds = []; unused = pool; }
  const allowed = unused.filter(item => item.type !== history.lastType);
  const choices = allowed.length ? allowed : unused;
  // Keep category bags balanced so a single category isn't left at the end.
  const counts = Object.fromEntries(choices.map(item => [item.type, unused.filter(other => other.type === item.type).length]));
  const maximum = Math.max(...Object.values(counts));
  const candidates = choices.filter(item => counts[item.type] === maximum);
  const item = candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
  return { item: { ...item }, usedIds: [...usedIds, item.id], lastType: item.type };
}
function formatSurprise(item) {
  return item.text + (item.answer ? `\n\n${item.answer}` : '') + (item.author ? `\n— ${item.author}` : '');
}
module.exports = { chooseSurprise, formatSurprise, pool };
