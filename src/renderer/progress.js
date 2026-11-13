(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./domain'));
  else root.HabitProgress = factory(root.HabitDomain);
})(globalThis, function (domain) {
  'use strict';
  const { localDay, shiftDay } = domain;
  const date = key => new Date(`${key}T12:00:00`);
  const unit = habit => habit.type === 'minutes' ? 'min' : habit.type === 'checkbox' ? 'days' : habit.unit?.trim() || '';
  const compatible = (entry, habit) => entry.type === habit.type && (habit.type !== 'count' || (entry.unit || '').trim().toLowerCase() === (habit.unit || '').trim().toLowerCase());
  const format = value => new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);

  function period(today, range, offset) {
    const at = date(today);
    if (range === 'week') {
      const start = shiftDay(today, -((at.getDay() + 6) % 7) + offset * 7);
      return { start, end: shiftDay(start, 6) };
    }
    const months = range === 'quarter' ? 3 : 1;
    const start = localDay(new Date(at.getFullYear(), at.getMonth() - months + 1 + offset * months, 1, 12));
    const first = date(start);
    return { start, end: localDay(new Date(first.getFullYear(), first.getMonth() + months, 0, 12)) };
  }

  function buildProgress(state, id, range = 'week', offset = 0, now = new Date()) {
    const habit = state.habits.find(item => item.id === id && !item.archived);
    if (!habit) return null;
    if (!['week', 'month', 'quarter'].includes(range)) range = 'week';
    offset = Number.isInteger(offset) ? Math.min(0, offset) : 0;
    const today = localDay(now, state.settings.dayStartHour);
    const records = Object.entries(state.days).filter(([day]) => day <= today).map(([day, entries]) => ({ day, entry: entries.find(item => item.id === id) })).filter(item => item.entry).sort((a, b) => a.day.localeCompare(b.day));
    const created = habit.createdDay || records[0]?.day || today;
    const incompatible = records.filter(item => !compatible(item.entry, habit)).at(-1);
    const currentFormatStart = incompatible ? records.find(item => item.day > incompatible.day && compatible(item.entry, habit))?.day || today : created;
    const first = [created, currentFormatStart].sort().at(-1);
    const bounds = period(today, range, offset);
    function days(start, end) {
      const result = []; let index = 0, previous = null;
      for (let day = start; day <= end; day = shiftDay(day, 1)) {
        while (index < records.length && records[index].day <= day) previous = records[index++];
        const entry = previous?.day === day ? previous.entry : null;
        const config = previous?.entry || habit;
        const future = day > today;
        const tracked = day >= first && compatible(config, habit);
        const eligible = tracked && !future;
        const amount = eligible && entry ? entry.amount : 0;
        const goal = config.goal;
        result.push({ day, future, tracked, eligible, amount, goal, complete: eligible && amount >= goal });
      }
      return result;
    }
    const daily = days(bounds.start, bounds.end);
    const eligible = daily.filter(item => item.eligible);
    const groups = [];
    for (const item of daily) {
      if (range !== 'quarter' || !groups.length || item.day.slice(0, 7) !== groups.at(-1)[0].day.slice(0, 7)) groups.push([]);
      groups.at(-1).push(item);
    }
    const points = groups.map(items => {
      const logged = items.filter(item => item.eligible);
      const completed = logged.filter(item => item.complete).length;
      return {
        start: items[0].day, end: items.at(-1).day,
        future: items.every(item => item.future), untracked: !logged.length && !items.every(item => item.future),
        eligible: logged.length, scheduled: items.filter(item => item.tracked).length,
        completed, total: logged.reduce((sum, item) => sum + item.amount, 0),
        consistency: logged.length ? Math.round(completed / items.length * 100) : null,
        value: !logged.length ? null : habit.type === 'checkbox' ? completed : logged.reduce((sum, item) => sum + item.amount, 0),
        goal: range !== 'quarter' ? items[0].goal : null,
      };
    });
    const total = eligible.reduce((sum, item) => sum + item.amount, 0);
    const completed = eligible.filter(item => item.complete).length;
    const goals = [...new Set(eligible.map(item => item.goal))];
    const guide = range === 'week' && habit.type !== 'checkbox' && goals.length === 1 ? goals[0] : null;
    const maximum = Math.max(1, guide || 0, ...points.map(point => point.value || 0));
    const previousBounds = period(today, range, offset - 1);
    const best = total > 0 ? eligible.reduce((a, b) => a.amount >= b.amount ? a : b) : null;
    let run = 0, longestRun = 0;
    for (const day of eligible) { run = day.complete ? run + 1 : 0; longestRun = Math.max(longestRun, run); }
    let insight;
    if (!eligible.length) insight = incompatible && bounds.start < first ? 'Earlier tracking formats aren’t mixed into this chart.' : 'Your history starts when this habit was added. Little steps will appear here.';
    else if (!total) insight = bounds.end >= today ? 'Your next little step will show up here.' : 'No progress was logged in this period.';
    else if (habit.type === 'checkbox') {
      insight = 'Each little check is a day you made room for yourself.';
    } else {
      insight = `Best day: ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date(best.day))} (${format(best.amount)}${unit(habit) ? ` ${unit(habit)}` : ''}).`;
    }
    return { habit, range, offset, today, ...bounds, first, points, completed, scheduled: daily.filter(item => item.tracked).length, eligible: eligible.length, total, best, longestRun, guide, maximum, insight, previousAvailable: previousBounds.end >= first, unit: unit(habit), formatChanged: !!incompatible && bounds.start < first };
  }
  return { buildProgress, period, format };
});
