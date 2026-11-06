(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HabitDomain = factory();
})(globalThis, function () {
  'use strict';
  function localDay(date, rolloverHour = 0) {
    const day = new Date(date);
    if (day.getHours() < rolloverHour) day.setDate(day.getDate() - 1);
    return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  }
  function shiftDay(key, amount) {
    const [year, month, day] = key.split('-').map(Number);
    return localDay(new Date(year, month - 1, day + amount, 12));
  }
  function todayEntries(state, now = new Date()) {
    const day = localDay(now, state.settings.dayStartHour);
    const activeIds = new Set(state.habits.filter(habit => !habit.archived).map(habit => habit.id));
    const entries = (state.days[day] || []).filter(entry => activeIds.has(entry.id)).map(entry => ({ ...entry, archived: false }));
    for (const habit of state.habits.filter(item => !item.archived)) {
      const existing = entries.find(item => item.id === habit.id);
      if (!existing) entries.push({ ...habit, amount: 0 });
    }
    return entries;
  }
  function orderedHabits(state, now = new Date()) {
    const amounts = new Map(todayEntries(state, now).map(entry => [entry.id, entry.amount]));
    return state.habits.filter(habit => !habit.archived).sort((first, second) =>
      Number((amounts.get(first.id) || 0) >= first.goal) - Number((amounts.get(second.id) || 0) >= second.goal));
  }
  function daySummary(entries) {
    // Retired, unfinished habits keep their progress without blocking today's finish.
    const goals = entries.filter(entry => !entry.archived || entry.amount >= entry.goal);
    const completed = goals.filter(entry => entry.amount >= entry.goal).length;
    const progress = entries.some(entry => entry.amount > 0);
    const allComplete = goals.length > 0 && completed === goals.length;
    const level = allComplete ? 4 : progress ? Math.max(1, Math.ceil(completed / Math.max(1, goals.length) * 3)) : 0;
    return { total: goals.length, completed, progress, allComplete, level };
  }
  function summary(state, now = new Date()) {
    const today = localDay(now, state.settings.dayStartHour);
    const entries = todayEntries(state, now);
    const todaySummary = daySummary(entries);
    const completedDays = Object.keys(state.days).filter(day => day <= today && daySummary(day === today ? entries : state.days[day]).allComplete).sort();
    if (todaySummary.allComplete && !completedDays.includes(today)) completedDays.push(today);
    let best = 0, run = 0, previous = null;
    for (const day of completedDays) {
      run = previous && shiftDay(previous, 1) === day ? run + 1 : 1;
      best = Math.max(best, run);
      previous = day;
    }
    const finished = new Set(completedDays);
    let cursor = todaySummary.allComplete ? today : shiftDay(today, -1);
    let current = 0;
    while (finished.has(cursor)) { current++; cursor = shiftDay(cursor, -1); }
    return { today, entries, ...todaySummary, current, best };
  }
  function calendar(state, mode = 'month', now = new Date()) {
    const data = summary(state, now);
    const [year, month] = data.today.split('-').map(Number);
    const first = mode === 'year' ? `${year}-01-01` : `${year}-${String(month).padStart(2, '0')}-01`;
    const last = localDay(mode === 'year' ? new Date(year, 11, 31, 12) : new Date(year, month, 0, 12));
    const start = shiftDay(first, -new Date(`${first}T12:00:00`).getDay());
    const end = shiftDay(last, 6 - new Date(`${last}T12:00:00`).getDay());
    const cells = [];
    for (let day = start; day <= end; day = shiftDay(day, 1)) {
      const info = daySummary(day === data.today ? data.entries : state.days[day] || []);
      cells.push({ day, ...info, outside: day < first || day > last, future: day > data.today });
    }
    return { cells, today: data.today, title: mode === 'year' ? String(year) : new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(`${first}T12:00:00`)) };
  }
  return { localDay, shiftDay, todayEntries, orderedHabits, daySummary, summary, calendar };
});
