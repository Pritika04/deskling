'use strict';
const { chooseSurprise } = require('./mystery');
const pool = require('../content/random.json');
const delay = random => (45 + random() * 45) * 60 * 1000;

// Wait for a quiet moment; sleeping computers never build a backlog.
function tickThoughts(store, show, now = new Date(), random = Math.random) {
  const history = store.snapshot().thoughts;
  if (!history.nextAt) { store.saveThoughts({ ...history, nextAt: now.getTime() + delay(random) }); return false; }
  if (now.getTime() < history.nextAt || now.getHours() < 8 || now.getHours() >= 22 || store.snapshot().settings.remindersPaused) return false;
  const selected = chooseSurprise(history, random, pool);
  // Availability checks happen before claiming content or advancing the bag.
  if (!show(selected.item, true)) return false;
  store.saveThoughts({ usedIds: selected.usedIds, lastType: selected.lastType, nextAt: now.getTime() + delay(random) });
  show(selected.item, false);
  return true;
}
function startThoughts(store, show) {
  const tick = () => { try { tickThoughts(store, show); } catch (error) { console.error('Buddy thought:', error.message); } };
  tick();
  const timer = setInterval(tick, 30000);
  return () => clearInterval(timer);
}
module.exports = { tickThoughts, startThoughts, pool };
