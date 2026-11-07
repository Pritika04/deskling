'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { localDay, todayEntries, daySummary, mysteryStatus } = require('./renderer/domain');
const { chooseSurprise } = require('./mystery');
const { catalog } = require('./renderer/wardrobe');
const { initialCollection, validateCollection, validateOutfit, accrueCoins } = require('./collection');

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
    settings: { avatarPosition: null, avatarSize: 160, remindersPaused: false, dayStartHour: 0, avatar: 'plant', palette: 'sage', accent: null, buddyName: '', hatched: false },
    habits: [],
    days: {},
    reminderDeliveries: {},
    reminderQueue: [],
    mystery: { days: {}, usedIds: [], lastType: null },
    thoughts: { usedIds: [], lastType: null, nextAt: 0, day: null },
    collection: initialCollection(),
    welcomes: { day: null, lastSeenAt: 0, lastGreetingAt: 0, lastMessage: '' },
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
  validateCollection(state.collection);
  if (!state.welcomes || (state.welcomes.day !== null && !/^\d{4}-\d{2}-\d{2}$/.test(state.welcomes.day)) || !Number.isFinite(state.welcomes.lastSeenAt) || state.welcomes.lastSeenAt < 0 || !Number.isFinite(state.welcomes.lastGreetingAt) || state.welcomes.lastGreetingAt < 0 || typeof state.welcomes.lastMessage !== 'string' || state.welcomes.lastMessage.length > 240) throw new Error('Invalid welcome history.');
  if (typeof state.settings.hatched !== 'boolean' || typeof state.settings.buddyName !== 'string' || state.settings.buddyName.length > 24 || (state.settings.hatched && !state.settings.buddyName.trim())) throw new Error('Give your buddy a name of up to 24 characters.');
  if (!state.thoughts || !Array.isArray(state.thoughts.usedIds) || state.thoughts.usedIds.some(id => typeof id !== 'string') || (state.thoughts.lastType !== null && typeof state.thoughts.lastType !== 'string') || !Number.isFinite(state.thoughts.nextAt) || state.thoughts.nextAt < 0) throw new Error('Invalid buddy thought history.');
  if (state.thoughts.day !== null && !/^\d{4}-\d{2}-\d{2}$/.test(state.thoughts.day)) throw new Error('Invalid buddy thought day.');
  if (!state.reminderDeliveries || typeof state.reminderDeliveries !== 'object' || Array.isArray(state.reminderDeliveries) || Object.values(state.reminderDeliveries).some(value => typeof value !== 'string')) throw new Error('Invalid reminder history.');
  if (!Array.isArray(state.reminderQueue) || state.reminderQueue.some(item => !item || typeof item.habitId !== 'string' || typeof item.slot !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.day))) throw new Error('Invalid reminder queue.');
  if (!state.mystery || !state.mystery.days || typeof state.mystery.days !== 'object' || Array.isArray(state.mystery.days) || !Array.isArray(state.mystery.usedIds) || state.mystery.usedIds.some(id => typeof id !== 'string') || (state.mystery.lastType !== null && typeof state.mystery.lastType !== 'string')) throw new Error('Invalid mystery box history.');
  for (const [day, reward] of Object.entries(state.mystery.days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !reward || !Array.isArray(reward.claimedIds) || reward.claimedIds.some(id => typeof id !== 'string') || !Array.isArray(reward.claims) || reward.claims.some(claim => !claim || ['id', 'type', 'title', 'text'].some(key => typeof claim[key] !== 'string'))) throw new Error('Invalid mystery box record.');
  }
  if (new Set(state.habits.map(habit => habit.id)).size !== state.habits.length) throw new Error('Duplicate habit IDs.');
  for (const [day, entries] of Object.entries(state.days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Array.isArray(entries)) throw new Error('Invalid day data.');
    for (const entry of entries) {
      validateHabit(entry);
      if (!Number.isFinite(entry.amount) || entry.amount < 0 || (entry.type !== 'minutes' && entry.amount > entry.goal)) throw new Error('Invalid progress.');
      if (entry.halfwayCelebrated !== undefined && typeof entry.halfwayCelebrated !== 'boolean') throw new Error('Invalid milestone data.');
      if (entry.treatEarned !== undefined && typeof entry.treatEarned !== 'boolean') throw new Error('Invalid treat milestone.');
    }
    if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error('Duplicate daily entries.');
  }
}

class Store {
  constructor(filePath, { now = () => new Date(), random = Math.random } = {}) {
    this.filePath = filePath;
    this.now = now;
    this.random = random;
    try {
      this.state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      // Existing step-2 files predate adjustable buddy size.
      if (this.state?.version === 1 && this.state.settings && !Object.hasOwn(this.state.settings, 'avatarSize')) this.state.settings.avatarSize = 68;
      if (this.state?.version === 1 && this.state.settings) {
        if (['cat', 'panda'].includes(this.state.settings.avatar)) this.state.settings.avatar = 'plant';
        if (!Object.hasOwn(this.state, 'reminderDeliveries')) this.state.reminderDeliveries = {};
        if (!Object.hasOwn(this.state, 'reminderQueue')) this.state.reminderQueue = [];
        if (!Object.hasOwn(this.state, 'mystery')) this.state.mystery = { days: {}, usedIds: [], lastType: null };
        if (!Object.hasOwn(this.state, 'collection')) this.state.collection = initialCollection();
        if (!Object.hasOwn(this.state, 'welcomes')) this.state.welcomes = { day: null, lastSeenAt: 0, lastGreetingAt: 0, lastMessage: '' };
        if (!Object.hasOwn(this.state, 'thoughts')) this.state.thoughts = { usedIds: [], lastType: null, nextAt: 0, day: null };
        if (this.state.thoughts && !Object.hasOwn(this.state.thoughts, 'day')) this.state.thoughts.day = null;
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
    next = structuredClone(next);
    validateState(next);
    accrueCoins(next, this.now());
    validateCollection(next.collection);
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

  nameBuddy(name) {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 24 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error('Give your buddy a name of up to 24 characters.');
    return this.updateSettings({ buddyName: name.trim(), hatched: true });
  }

  refreshRewards() {
    const next = this.snapshot();
    return accrueCoins(next, this.now()) ? this.commit(next) : null;
  }

  saveWelcome(patch) {
    if (!patch || Object.keys(patch).some(key => !Object.hasOwn(this.state.welcomes, key))) throw new Error('Unknown welcome setting.');
    const next = this.snapshot(); Object.assign(next.welcomes, patch); return this.commit(next);
  }

  buyAccessory(id) {
    const item = catalog.find(entry => entry.id === id);
    if (!item) throw new Error('That accessory is not in the shop.');
    if (!this.state.settings.hatched) throw new Error('Meet your buddy first.');
    const next = this.snapshot();
    accrueCoins(next, this.now());
    if (next.collection.owned.includes(id)) return this.snapshot();
    if (next.collection.coins < item.price) throw new Error('A few more little wins will get you there.');
    next.collection.coins -= item.price;
    next.collection.owned.push(id);
    next.collection.equipped[item.slot] = id;
    return this.commit(next);
  }

  equipOutfit(outfit) {
    validateOutfit(outfit, this.state.collection.owned);
    const next = this.snapshot(); next.collection.equipped = structuredClone(outfit);
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

  enqueueReminder(habitId, slot) {
    const next = this.snapshot();
    if (next.reminderDeliveries[habitId] === slot) return next;
    next.reminderDeliveries[habitId] = slot;
    next.reminderQueue.push({ habitId, slot, day: localDay(this.now()) });
    return this.commit(next);
  }

  removeReminder(habitId, slot) {
    const next = this.snapshot();
    next.reminderQueue = next.reminderQueue.filter(item => item.habitId !== habitId || item.slot !== slot);
    return this.commit(next);
  }

  clearReminderQueue() {
    if (!this.state.reminderQueue.length) return this.snapshot();
    const next = this.snapshot(); next.reminderQueue = []; return this.commit(next);
  }

  openMystery() {
    const status = mysteryStatus(this.state, this.now());
    if (!status.available) return { opened: false, state: this.snapshot() };
    const next = this.snapshot();
    const selected = chooseSurprise(next.mystery, this.random);
    const record = next.mystery.days[status.day] || { claimedIds: [], claims: [] };
    record.claimedIds = [...new Set([...record.claimedIds, ...next.habits.filter(habit => !habit.archived).map(habit => habit.id)])];
    record.claims.push(selected.item); next.mystery.days[status.day] = record;
    next.mystery.usedIds = selected.usedIds; next.mystery.lastType = selected.lastType;
    return { opened: true, item: selected.item, state: this.commit(next) };
  }

  saveThoughts(history) {
    const next = this.snapshot(); next.thoughts = history; return this.commit(next);
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
    const completed = before < entry.goal && entry.amount >= entry.goal;
    const allComplete = daySummary(next.days[day]).allComplete;
    const treatEligible = completed && !allComplete && !entry.treatEarned;
    if (completed) entry.treatEarned = true;
    const result = {
      day, habitId, amount: entry.amount,
      halfway,
      completed, allComplete, treatEligible,
      state: this.commit(next),
    };
    return result;
  }
}

module.exports = { Store, localDay };
