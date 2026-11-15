'use strict';
const { chooseSurprise } = require('./mystery');
const pool = require('../content/random.json').filter(item => item.type === 'joke');
const { localDay } = require('./renderer/domain');
const MAX_GAP = 120 * 60 * 1000;
const SCHEDULE_VERSION = 3;
const JOKE_COOLDOWN = 7 * 24 * 60 * 60 * 1000;
const firstDelay = random => (30 + random() * 30) * 60 * 1000;
const delay = random => (75 + random() * 45) * 60 * 1000;
const thoughtDuration = text => Math.min(12000, Math.max(6000, 2000 + Array.from(text).length * 55));
function jokeSequence(item) {
  if (!['joke', 'riddle'].includes(item.type) || typeof item.answer !== 'string' || !item.answer.trim()) return null;
  const punchline = `${item.answer.trim()} 😂`;
  return { question: item.text, punchline, thinkingMs: 3000, answerMs: thoughtDuration(punchline) };
}

function chooseThought(history, now, random = Math.random, items = pool) {
  const eligible = items.filter(item => history.shownAt?.[item.id] === undefined || now.getTime() - history.shownAt[item.id] >= JOKE_COOLDOWN);
  if (!eligible.length) return null;
  const unused = eligible.filter(item => !history.usedIds.includes(item.id));
  const selected = chooseSurprise({ usedIds: [], lastType: history.lastType }, random, unused.length ? unused : eligible);
  return { ...selected, usedIds: unused.length ? [...history.usedIds.filter(id => items.some(item => item.id === id)), selected.item.id] : [selected.item.id] };
}

// Wait for a quiet moment; sleeping computers never build a backlog.
function tickThoughts(store, show, now = new Date(), random = Math.random, computerActive = true) {
  const history = store.snapshot().thoughts;
  if (!computerActive || store.snapshot().settings.remindersPaused) return false;
  if (!history.shownAt) {
    // Older profiles know which jokes were used, but not their delivery times.
    // Give those jokes a fresh cooldown once rather than risk an early repeat.
    history.shownAt = Object.fromEntries(history.usedIds.map(id => [id, now.getTime()]));
    store.saveThoughts(history);
  }
  const day = localDay(now);
  // Upgrade once without postponing a thought that is already due. Ordinary
  // restarts and midnight preserve the deadline instead of resetting the wait.
  if (!history.nextAt || history.scheduleVersion !== SCHEDULE_VERSION || history.nextAt > now.getTime() + MAX_GAP) {
    const nextAt = Math.min(history.nextAt || Infinity, now.getTime() + firstDelay(random));
    store.saveThoughts({ ...history, day, scheduleVersion: SCHEDULE_VERSION, nextAt }); return false;
  }
  if (now.getTime() < history.nextAt) return false;
  const selected = chooseThought(history, now, random);
  if (!selected) return false;
  // Availability checks happen before claiming content or advancing the bag.
  if (!show(selected.item, true)) return false;
  store.saveThoughts({ ...history, usedIds: selected.usedIds, lastType: selected.lastType, shownAt: { ...history.shownAt, [selected.item.id]: now.getTime() }, day, scheduleVersion: SCHEDULE_VERSION, nextAt: now.getTime() + delay(random) });
  show(selected.item, false);
  return true;
}
function startThoughts(store, show, { isComputerActive = () => true } = {}) {
  const tick = () => { try { tickThoughts(store, show, new Date(), Math.random, isComputerActive()); } catch (error) { console.error('Buddy thought:', error.message); } };
  tick();
  const timer = setInterval(tick, 30000);
  return () => clearInterval(timer);
}
module.exports = { tickThoughts, startThoughts, pool, thoughtDuration, jokeSequence, chooseThought };
