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
    const streak = streakStatus(completedDays, state.collection?.repairs || [], today, todaySummary.allComplete);
    const allowance = repairAllowance(state, now);
    return { today, entries, ...todaySummary, ...streak, repair: allowance.used ? null : streak.repair, repairAllowance: allowance };
  }
  function repairAllowance(state, now = new Date()) {
    const month = localDay(now).slice(0, 7);
    const used = (state.collection?.repairs || []).some(repair => repair.boughtOn.slice(0, 7) === month);
    return { used, nextAvailable: localDay(new Date(now.getFullYear(), now.getMonth() + 1, 1, 12)) };
  }
  const milestoneBonus = days => Number.isSafeInteger(days) && days > 0 ? ({ 3: 1, 5: 2, 10: 4, 30: 15, 50: 30 }[days] || (days >= 100 && days % 50 === 0 ? 50 : 0)) : 0;
  function milestoneDays(count) {
    const days = [3, 5, 10, 30, 50];
    for (let day = 100; day <= count; day += 50) days.push(day);
    return days.filter(day => day <= count);
  }
  function nextMilestone(count) {
    const days = [3, 5, 10, 30, 50].find(day => day > count) || (Math.floor(count / 50) + 1) * 50;
    return { days, remaining: days - count, coins: milestoneBonus(days) };
  }
  function streakStatus(completedDays, repairs, today, complete) {
    const finished = new Set(completedDays), first = completedDays[0];
    if (!first) return { current: 0, best: 0, streakStart: null, frozen: false, graceDay: null, repair: null };
    const end = complete ? today : shiftDay(today, -1);
    let current = 0, best = 0, streakStart = null, misses = 0, lastCompleted = null, broken = null;
    for (let day = first; day <= end; day = shiftDay(day, 1)) {
      if (finished.has(day)) {
        if (!current) streakStart = day;
        current++; misses = 0; lastCompleted = day; best = Math.max(best, current);
      } else if (repairs.some(repair => day >= repair.from && day <= repair.through)) {
        misses = 0;
      } else if (current && ++misses === 2) {
        broken = { id: `${streakStart}:${day}`, start: streakStart, count: current, lastCompleted, brokenOn: day };
        current = 0; streakStart = null;
      }
    }
    // A recent break can also be repaired after logging today's habits.
    const repair = broken && today <= shiftDay(broken.brokenOn, 6) && !repairs.some(item => item.id === broken.id)
      ? { ...broken, count: broken.count + current, from: shiftDay(broken.lastCompleted, 1), through: shiftDay(today, -1), price: 6 } : null;
    const frozen = current > 0 && misses === 1;
    return { current, best, streakStart, frozen, graceDay: frozen ? shiftDay(today, -1) : null, repair };
  }
  function graceNotice(state, now = new Date()) {
    if (!state.settings.hatched || !state.habits.some(habit => !habit.archived)) return null;
    const progress = summary(state, now);
    if (!progress.frozen || (state.collection?.graceNotices || []).includes(progress.graceDay)) return null;
    return { day: progress.graceDay, text: 'A little pause is okay 💛 Your streak is safe. Complete your habits today to keep it going.' };
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
  function mysteryStatus(state, now = new Date()) {
    const day = localDay(now, state.settings.dayStartHour);
    const habits = state.habits.filter(habit => !habit.archived);
    const entries = todayEntries(state, now);
    const claimedIds = state.mystery?.days[day]?.claimedIds || [];
    const allComplete = habits.length > 0 && habits.every(habit => (entries.find(entry => entry.id === habit.id)?.amount || 0) >= habit.goal);
    return { day, available: allComplete && habits.some(habit => !claimedIds.includes(habit.id)), opened: state.mystery?.days[day]?.claims.length || 0 };
  }
  function coinEarnings(state, now = new Date()) {
    const day = localDay(now, state.settings.dayStartHour), collection = state.collection;
    const rewards = (collection.earnings || []).filter(reward => reward.day === day && ((reward.kind === 'daily' && reward.coins === 1) || (reward.kind === 'streak' && reward.coins === milestoneBonus(reward.streak) && reward.coins > 0))).map(reward => ({ ...reward }));
    const ids = new Set(rewards.map(reward => reward.id));
    const add = reward => { if (!ids.has(reward.id)) { rewards.push(reward); ids.add(reward.id); } };
    if (collection.rewardedDays.includes(day)) add({ id: `daily:${day}`, kind: 'daily', coins: 1 });
    return rewards.sort((a, b) => (a.kind === 'daily' ? 0 : a.streak) - (b.kind === 'daily' ? 0 : b.streak)).map(reward => ({ ...reward, label: reward.kind === 'streak' ? `${reward.streak}-day streak` : 'All habits complete' }));
  }
  return { localDay, shiftDay, todayEntries, orderedHabits, daySummary, summary, calendar, mysteryStatus, coinEarnings, milestoneBonus, milestoneDays, nextMilestone, graceNotice };
});
