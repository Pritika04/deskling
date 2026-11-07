'use strict';
const { chooseSurprise } = require('./mystery');
const pool = require('../content/random.json');
const { localDay } = require('./renderer/domain');
const MAX_GAP = 120 * 60 * 1000;
const SCHEDULE_VERSION = 3;
const firstDelay = random => (30 + random() * 30) * 60 * 1000;
const delay = random => (75 + random() * 45) * 60 * 1000;
const thoughtDuration = text => Math.min(12000, Math.max(6000, 2000 + Array.from(text).length * 55));

// Wait for a quiet moment; sleeping computers never build a backlog.
function tickThoughts(store, show, now = new Date(), random = Math.random, computerActive = true) {
  const history = store.snapshot().thoughts;
  if (!computerActive || store.snapshot().settings.remindersPaused) return false;
  const day = localDay(now);
  // Upgrade once without postponing a thought that is already due. Ordinary
  // restarts and midnight preserve the deadline instead of resetting the wait.
  if (!history.nextAt || history.scheduleVersion !== SCHEDULE_VERSION || history.nextAt > now.getTime() + MAX_GAP) {
    const nextAt = Math.min(history.nextAt || Infinity, now.getTime() + firstDelay(random));
    store.saveThoughts({ ...history, day, scheduleVersion: SCHEDULE_VERSION, nextAt }); return false;
  }
  if (now.getTime() < history.nextAt) return false;
  const selected = chooseSurprise(history, random, pool);
  // Availability checks happen before claiming content or advancing the bag.
  if (!show(selected.item, true)) return false;
  store.saveThoughts({ usedIds: selected.usedIds, lastType: selected.lastType, day, scheduleVersion: SCHEDULE_VERSION, nextAt: now.getTime() + delay(random) });
  show(selected.item, false);
  return true;
}
function startThoughts(store, show, { isComputerActive = () => true } = {}) {
  const tick = () => { try { tickThoughts(store, show, new Date(), Math.random, isComputerActive()); } catch (error) { console.error('Buddy thought:', error.message); } };
  tick();
  const timer = setInterval(tick, 30000);
  return () => clearInterval(timer);
}
module.exports = { tickThoughts, startThoughts, pool, thoughtDuration };
