'use strict';
const { localDay, todayEntries } = require('./renderer/domain');
const reminderTemplates = require('../content/reminders.json');

class ReminderMessages {
  constructor(random = Math.random) { this.random = random; this.bag = []; this.last = null; }
  next(habit) {
    if (!this.bag.length) {
      this.bag = reminderTemplates.map((_, index) => index);
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
      if (this.bag.at(-1) === this.last) [this.bag[0], this.bag[this.bag.length - 1]] = [this.bag.at(-1), this.bag[0]];
    }
    this.last = this.bag.pop();
    return reminderTemplates[this.last].replaceAll('{habit}', habit);
  }
}
const minutes = time => { const [hour, minute] = time.split(':').map(Number); return hour * 60 + minute; };

function dueReminders(state, now = new Date()) {
  if (state.settings.remindersPaused) return [];
  const clock = now.getHours() * 60 + now.getMinutes();
  const date = localDay(now);
  const entries = todayEntries(state, now);
  const due = [];
  for (const habit of state.habits.filter(item => !item.archived)) {
    if (entries.find(entry => entry.id === habit.id)?.amount >= habit.goal) continue;
    const reminder = habit.reminder;
    let slots = habit.reminderTimes || [];
    if (reminder?.mode === 'daily') slots = [reminder.time];
    if (reminder?.mode === 'repeat') {
      slots = [];
      for (let at = minutes(reminder.time); at <= minutes(reminder.until); at += reminder.everyMinutes) slots.push(at);
    }
    const scheduled = slots.map(slot => typeof slot === 'number' ? slot : minutes(slot)).find(slot => slot === clock);
    if (scheduled === undefined) continue;
    const slot = `${date}:${scheduled}`;
    if (state.reminderDeliveries[habit.id] !== slot) due.push({ habit, slot });
  }
  return due;
}

function processReminders(store, notify, now = new Date()) {
  if (store.snapshot().settings.remindersPaused) { store.clearReminderQueue(); return; }
  for (const { habit, slot } of dueReminders(store.snapshot(), now)) store.enqueueReminder(habit.id, slot);
  const clock = now.getHours() * 60 + now.getMinutes();
  for (const queued of store.snapshot().reminderQueue) {
    const state = store.snapshot();
    const habit = state.habits.find(item => item.id === queued.habitId && !item.archived);
    const entry = todayEntries(state, now).find(item => item.id === queued.habitId);
    if (!habit || queued.day !== localDay(now) || clock - Number(queued.slot.split(':')[1]) > 15 || (entry?.amount || 0) >= habit.goal) {
      store.removeReminder(queued.habitId, queued.slot); continue;
    }
    if (notify(habit) !== false) store.removeReminder(queued.habitId, queued.slot);
    break; // One calm bubble at a time, including simultaneous reminder times.
  }
}

function startReminders(store, notify, onError = console.error) {
  const tick = () => {
    try {
      processReminders(store, notify);
    } catch (error) { onError(error); }
  };
  tick();
  const timer = setInterval(tick, 15000);
  return () => clearInterval(timer);
}
module.exports = { dueReminders, processReminders, startReminders, ReminderMessages };
