'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { localDay, todayEntries, daySummary } = require('./renderer/domain');

const TYPES = ['count', 'checkbox', 'minutes', 'percent'];
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
function validateReminder(reminder) {
  if (reminder === undefined || reminder === null) return;
  if (!['daily', 'repeat'].includes(reminder.mode) || !CLOCK.test(reminder.time) ||
      (reminder.mode === 'repeat' && (![30, 60, 120, 180, 240].includes(reminder.everyMinutes) || !CLOCK.test(reminder.until) || reminder.until <= reminder.time))) {
    throw new Error('Choose a reminder time and an end time later than the start.');
  }
}

function initialState() {
  return {
    version: 1,
    settings: { avatarPosition: null, avatarSize: 68, remindersPaused: false, dayStartHour: 0, avatar: 'plant', palette: 'sage', accent: null },
    habits: [],
    days: {},
    reminderDeliveries: {},
  };
}

function validateHabit(habit) {
  if (!habit || typeof habit.id !== 'string' || !habit.id || typeof habit.name !== 'string' || !habit.name.trim() || habit.name.length > 80 ||
      !TYPES.includes(habit.type) || !Number.isFinite(habit.goal) || habit.goal <= 0 ||
      (habit.type === 'checkbox' && habit.goal !== 1) || (habit.type === 'percent' && habit.goal > 100) ||
      typeof habit.archived !== 'boolean' || (habit.reminderTimes !== undefined && (!Array.isArray(habit.reminderTimes) || habit.reminderTimes.length > 12 || habit.reminderTimes.some(time => typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))))) throw new Error('Please check the habit name, type, goal, and reminder times.');
  if (habit.unit !== undefined && (typeof habit.unit !== 'string' || habit.unit.length > 24)) throw new Error('Keep the unit to 24 characters or fewer.');
  validateReminder(habit.reminder);
}

function validateState(state) {
  if (!state || state.version !== 1 || !Array.isArray(state.habits) || !state.settings ||
      !state.days || typeof state.days !== 'object' || Array.isArray(state.days)) throw new Error('Unsupported or invalid data file.');
  const { avatarPosition, avatarSize, remindersPaused, dayStartHour } = state.settings;
  if (typeof remindersPaused !== 'boolean' || !Number.isInteger(dayStartHour) || dayStartHour < 0 || dayStartHour > 23 ||
      !Number.isInteger(avatarSize) || avatarSize < 64 || avatarSize > 160 ||
      (avatarPosition !== null && (!avatarPosition || !Number.isFinite(avatarPosition.x) || !Number.isFinite(avatarPosition.y)))) {
    throw new Error('Invalid settings.');
  }
  if (!['plant', 'pineapple', 'star'].includes(state.settings.avatar) || !['sage', 'lavender', 'peach', 'ocean'].includes(state.settings.palette) ||
      (state.settings.accent !== null && !/^#[0-9a-f]{6}$/i.test(state.settings.accent))) throw new Error('Invalid appearance settings.');
  state.habits.forEach(validateHabit);
  if (!state.reminderDeliveries || typeof state.reminderDeliveries !== 'object' || Array.isArray(state.reminderDeliveries) || Object.values(state.reminderDeliveries).some(value => typeof value !== 'string')) throw new Error('Invalid reminder history.');
  if (new Set(state.habits.map(habit => habit.id)).size !== state.habits.length) throw new Error('Duplicate habit IDs.');
  for (const [day, entries] of Object.entries(state.days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Array.isArray(entries)) throw new Error('Invalid day data.');
    for (const entry of entries) {
      validateHabit(entry);
      if (!Number.isFinite(entry.amount) || entry.amount < 0 || (entry.type !== 'minutes' && entry.amount > entry.goal)) throw new Error('Invalid progress.');
      if (entry.halfwayCelebrated !== undefined && typeof entry.halfwayCelebrated !== 'boolean') throw new Error('Invalid milestone data.');
    }
    if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error('Duplicate daily entries.');
  }
}

class Store {
  constructor(filePath, { now = () => new Date() } = {}) {
    this.filePath = filePath;
    this.now = now;
    try {
      this.state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      // Existing step-2 files predate adjustable buddy size.
      if (this.state?.version === 1 && this.state.settings && !Object.hasOwn(this.state.settings, 'avatarSize')) this.state.settings.avatarSize = 68;
      if (this.state?.version === 1 && this.state.settings) {
        if (['cat', 'panda'].includes(this.state.settings.avatar)) this.state.settings.avatar = 'plant';
        if (!Object.hasOwn(this.state, 'reminderDeliveries')) this.state.reminderDeliveries = {};
        for (const [key, value] of Object.entries(initialState().settings)) {
          if (!Object.hasOwn(this.state.settings, key)) this.state.settings[key] = value;
        }
      }
      if (this.state?.version === 1 && Array.isArray(this.state.habits)) {
        const converted = new Set();
        for (const habit of this.state.habits) if (habit.type === 'percent') {
          habit.type = 'count'; habit.goal = 100; habit.unit = 'points'; converted.add(habit.id);
        }
        const today = localDay(this.now(), this.state.settings.dayStartHour);
        for (const entry of this.state.days?.[today] || []) if (converted.has(entry.id) && this.state.habits.some(habit => habit.id === entry.id && !habit.archived)) {
          entry.type = 'count'; entry.goal = 100; entry.unit = 'points';
        }
      }
      validateState(this.state);
    } catch (error) {
      // Never silently replace existing data that cannot be read.
      if (error.code !== 'ENOENT') throw new Error(`Could not load ${filePath}: ${error.message}`);
      this.state = initialState();
      this.commit(this.state);
    }
  }

  snapshot() { return structuredClone(this.state); }

  commit(next) {
    validateState(next);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporary, this.filePath);
    this.state = next;
    return this.snapshot();
  }

  updateSettings(patch) {
    if (!patch || Object.keys(patch).some(key => !Object.hasOwn(this.state.settings, key))) throw new Error('Unknown setting.');
    const next = this.snapshot();
    Object.assign(next.settings, patch);
    return this.commit(next);
  }

  syncToday(next) {
    next.days[localDay(this.now(), next.settings.dayStartHour)] = todayEntries(next, this.now());
  }

  addHabit({ name, type, goal, reminderTimes = [], reminder = null, unit = '' }) {
    if (!['count', 'checkbox', 'minutes'].includes(type)) throw new Error('Choose count, check off, or minutes.');
    const habit = { id: randomUUID(), name: typeof name === 'string' ? name.trim() : name, type, goal: type === 'checkbox' ? 1 : type === 'percent' ? 100 : goal, reminderTimes, reminder, unit: typeof unit === 'string' ? unit.trim() : unit, archived: false };
    validateHabit(habit);
    const next = this.snapshot();
    next.habits.push(habit);
    this.syncToday(next);
    this.commit(next);
    return structuredClone(habit);
  }

  editHabit(id, { name, type, goal, reminderTimes = [], reminder = null, unit = '' }) {
    if (!['count', 'checkbox', 'minutes'].includes(type)) throw new Error('Choose count, check off, or minutes.');
    const next = this.snapshot();
    const habit = next.habits.find(item => item.id === id && !item.archived);
    if (!habit) throw new Error('Habit not found.');
    const previousType = habit.type;
    Object.assign(habit, { name: typeof name === 'string' ? name.trim() : name, type, goal: type === 'checkbox' ? 1 : type === 'percent' ? 100 : goal, reminderTimes, reminder, unit: typeof unit === 'string' ? unit.trim() : unit });
    validateHabit(habit);
    this.syncToday(next);
    const entry = next.days[localDay(this.now(), next.settings.dayStartHour)].find(item => item.id === id);
    const amount = previousType === type ? type === 'minutes' ? entry.amount : Math.min(entry.amount, habit.goal) : 0;
    Object.assign(entry, habit, { amount });
    if (previousType !== type) delete entry.halfwayCelebrated;
    return this.commit(next);
  }

  archiveHabit(id) {
    const next = this.snapshot();
    const habit = next.habits.find(item => item.id === id);
    if (!habit) throw new Error('Habit not found.');
    habit.archived = true;
    const today = localDay(this.now(), next.settings.dayStartHour);
    if (next.days[today]) next.days[today] = next.days[today].filter(entry => entry.id !== id);
    return this.commit(next);
  }

  reorderHabits(ids) {
    const next = this.snapshot();
    const active = next.habits.filter(habit => !habit.archived);
    if (!Array.isArray(ids) || ids.length !== active.length || new Set(ids).size !== ids.length || ids.some(id => !active.some(habit => habit.id === id))) throw new Error('Habit order has changed. Please try again.');
    next.habits = [...ids.map(id => active.find(habit => habit.id === id)), ...next.habits.filter(habit => habit.archived)];
    return this.commit(next);
  }

  markReminder(id, slot) {
    const next = this.snapshot();
    next.reminderDeliveries[id] = slot;
    return this.commit(next);
  }

  logProgress(habitId, amount, { replace = false } = {}) {
    if (!Number.isFinite(amount) || (replace ? amount < 0 : amount <= 0)) throw new Error('Enter a valid amount of progress.');
    const next = this.snapshot();
    const habit = next.habits.find(item => item.id === habitId && !item.archived);
    if (!habit) throw new Error('Habit not found.');
    if (replace && habit.type !== 'minutes') throw new Error('Only minute totals can be edited directly.');
    const day = localDay(this.now(), next.settings.dayStartHour);
    this.syncToday(next);
    const entry = next.days[day].find(item => item.id === habitId);
    const before = entry.amount;
    entry.amount = habit.type === 'minutes' ? replace ? amount : before + amount : Math.min(entry.goal, before + amount);
    const halfway = !entry.halfwayCelebrated && before < entry.goal / 2 && entry.amount >= entry.goal / 2 && entry.amount < entry.goal;
    if (entry.amount >= entry.goal / 2) entry.halfwayCelebrated = true;
    const result = {
      day, habitId, amount: entry.amount,
      halfway,
      completed: before < entry.goal && entry.amount >= entry.goal,
      allComplete: daySummary(next.days[day]).allComplete,
      state: this.commit(next),
    };
    return result;
  }
}

module.exports = { Store, localDay };
