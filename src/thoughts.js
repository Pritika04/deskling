'use strict';
const { chooseSurprise } = require('./mystery');
const pool = require('../content/random.json');
const { localDay } = require('./renderer/domain');
const delay = random => (30 + random() * 120) * 60 * 1000;

// Wait for a quiet moment; sleeping computers never build a backlog.
function tickThoughts(store, show, now = new Date(), random = Math.random) {
  const history = store.snapshot().thoughts;
  if (now.getHours() < 8 || now.getHours() >= 22 || store.snapshot().settings.remindersPaused) return false;
  const day = localDay(now);
  // Each morning starts with a fresh random wait, rather than yesterday's
  // overdue thought appearing immediately when the computer wakes up.
  if (!history.nextAt || history.day !== day) {
    store.saveThoughts({ ...history, day, nextAt: now.getTime() + delay(random) }); return false;
  }
  if (now.getTime() < history.nextAt) return false;
  const selected = chooseSurprise(history, random, pool);
  // Availability checks happen before claiming content or advancing the bag.
  if (!show(selected.item, true)) return false;
  store.saveThoughts({ usedIds: selected.usedIds, lastType: selected.lastType, day, nextAt: now.getTime() + delay(random) });
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
