'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const TYPES = ['count', 'checkbox', 'minutes', 'percent'];

function localDay(date, rolloverHour = 0) {
  const day = new Date(date);
  if (day.getHours() < rolloverHour) day.setDate(day.getDate() - 1);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}

function initialState() {
  return {
    version: 1,
    settings: { avatarPosition: null, avatarSize: 68, remindersPaused: false, dayStartHour: 0 },
    habits: [],
    days: {},
  };
}

function validateHabit(habit) {
  if (!habit || typeof habit.id !== 'string' || !habit.id || typeof habit.name !== 'string' || !habit.name.trim() ||
      !TYPES.includes(habit.type) || !Number.isFinite(habit.goal) || habit.goal <= 0 ||
      (habit.type === 'checkbox' && habit.goal !== 1) || (habit.type === 'percent' && habit.goal > 100) ||
      typeof habit.archived !== 'boolean') throw new Error('Invalid habit data.');
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
  state.habits.forEach(validateHabit);
  if (new Set(state.habits.map(habit => habit.id)).size !== state.habits.length) throw new Error('Duplicate habit IDs.');
  for (const [day, entries] of Object.entries(state.days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Array.isArray(entries)) throw new Error('Invalid day data.');
    for (const entry of entries) {
      validateHabit(entry);
      if (!Number.isFinite(entry.amount) || entry.amount < 0 || entry.amount > entry.goal) throw new Error('Invalid progress.');
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

  // Data-layer foundation for step 3; no presets or add-habit UI yet.
  addHabit({ name, type, goal }) {
    const habit = { id: randomUUID(), name: typeof name === 'string' ? name.trim() : name, type, goal: type === 'checkbox' ? 1 : goal, archived: false };
    validateHabit(habit);
    const next = this.snapshot();
    next.habits.push(habit);
    this.commit(next);
    return structuredClone(habit);
  }

  archiveHabit(id) {
    const next = this.snapshot();
    const habit = next.habits.find(item => item.id === id);
    if (!habit) throw new Error('Habit not found.');
    habit.archived = true;
    return this.commit(next);
  }

  logProgress(habitId, amount) {
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Progress must be a positive number.');
    const next = this.snapshot();
    const habit = next.habits.find(item => item.id === habitId && !item.archived);
    if (!habit) throw new Error('Habit not found.');
    const day = localDay(this.now(), next.settings.dayStartHour);
    if (!Object.hasOwn(next.days, day)) next.days[day] = [];
    // Snapshot the active habits and goals so later edits/removal keep history intact.
    for (const active of next.habits.filter(item => !item.archived)) {
      if (!next.days[day].some(entry => entry.id === active.id)) next.days[day].push({ ...active, amount: 0 });
    }
    const entry = next.days[day].find(item => item.id === habitId);
    const before = entry.amount;
    entry.amount = Math.min(entry.goal, before + amount);
    const result = {
      day, habitId, amount: entry.amount,
      completed: before < entry.goal && entry.amount >= entry.goal,
      allComplete: next.days[day].length > 0 && next.days[day].every(item => item.amount >= item.goal),
      state: this.commit(next),
    };
    return result;
  }
}

module.exports = { Store, localDay };
