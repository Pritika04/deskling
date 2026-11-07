'use strict';
const { localDay, todayEntries, daySummary } = require('./renderer/domain');
const { foods, messages: treatMessages } = require('../content/treats.json');

class ShuffleBag {
  constructor(items, random) { this.items = items; this.random = random; this.remaining = []; this.last = null; }
  take() {
    if (!this.remaining.length) {
      this.remaining = [...this.items];
      for (let i = this.remaining.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [this.remaining[i], this.remaining[j]] = [this.remaining[j], this.remaining[i]];
      }
      const end = this.remaining.length - 1;
      if (this.remaining[end] === this.last) [this.remaining[0], this.remaining[end]] = [this.remaining[end], this.remaining[0]];
    }
    this.last = this.remaining.pop(); return this.last;
  }
}

class TreatPicker {
  constructor(random = Math.random) {
    this.foodBag = new ShuffleBag(foods, random);
    this.messageBag = new ShuffleBag(treatMessages, random);
  }
  next() {
    const food = this.foodBag.take();
    const message = this.messageBag.take()
      .replaceAll('{food}', food.name)
      .replaceAll('{Food}', food.name[0].toUpperCase() + food.name.slice(1));
    return { food, message };
  }
}

// A small session ritual, not another inventory or currency.
class TreatQueue {
  constructor() { this.day = null; this.pending = new Set(); this.requested = false; }
  clear() { this.pending.clear(); this.requested = false; }
  record(result) {
    if (this.day !== result.day) { this.clear(); this.day = result.day; }
    if (result.allComplete) this.clear();
    else if (result.treatEligible) this.pending.add(result.habitId);
  }
  prune(state, now = new Date()) {
    const day = localDay(now, state.settings.dayStartHour);
    if (this.day !== day) { this.clear(); this.day = day; }
    const entries = todayEntries(state, now);
    if (daySummary(entries).allComplete) { this.clear(); return; }
    const completed = new Set(entries.filter(entry => entry.amount >= entry.goal).map(entry => entry.id));
    for (const id of this.pending) if (!completed.has(id)) this.pending.delete(id);
    if (!this.pending.size) this.requested = false;
  }
  request(state, now) { this.prune(state, now); this.requested = this.pending.size > 0; return this.requested; }
  take(state, now) {
    this.prune(state, now);
    if (!this.requested || !this.pending.size) return null;
    const result = { size: this.pending.size > 1 ? 'big' : 'small' };
    this.clear(); return result;
  }
}
module.exports = { TreatQueue, TreatPicker, foods, treatMessages };
