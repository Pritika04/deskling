'use strict';
const { localDay, todayEntries } = require('./renderer/domain');
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

function startReminders(store, notify, onError = console.error) {
  const tick = () => {
    try {
      for (const { habit, slot } of dueReminders(store.snapshot())) {
        if (notify(habit) !== false) store.markReminder(habit.id, slot);
      }
    } catch (error) { onError(error); }
  };
  tick();
  const timer = setInterval(tick, 15000);
  return () => clearInterval(timer);
}
module.exports = { dueReminders, startReminders };
