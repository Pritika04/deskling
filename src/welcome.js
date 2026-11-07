'use strict';
const { localDay } = require('./renderer/domain');
const HOUR = 60 * 60 * 1000;
const morning = ['Morning, sunshine! One little step at a time.', 'Good morning! Your little cheerleader is here.', 'A fresh day, tiny steps. You’ve got this!', 'Morning! Let’s make room for something good today.', 'Hello, new day! Ready for one small win?'];
const returns = ['You’re back! I missed your company.', 'There you are. I saved your spot.', 'Welcome back! A little stretch before we begin?', 'Oh, hello again. Ready when you are.', 'Back together. One little step at a time.'];
const later = ['Hello, sunshine! There’s still room for a little win.', 'A little hello. Let’s make the rest of today lovely.', 'Your little cheerleader is here. Ready when you are.'];
morning.push('Morning! What tiny win shall we chase today?', 'Good morning! If today had a theme song, what would it be?', 'Rise and shine! What are you looking forward to today?', 'Morning! I brought the wiggles. You bring your lovely self.', 'New day, same tiny sidekick. What is our first adventure?');
returns.push('You’re back! If we could teleport for a snack, where would we go?', 'There you are! What was the best little bit of your break?', 'Welcome back! Important question: pancakes or waffles?', 'Reunited! Shall we start with a stretch or a tiny victory?', 'You’re here! I have been practicing my welcome wiggle.', 'Hello again! If today were a color, which one would it be?', 'Back for another little adventure? I am coming too.', 'Welcome back! What is one nice thing we can do for you today?');
later.push('Hello, you! What is one little thing worth smiling about?', 'Your tiny sidekick has arrived. What is our next adventure?', 'A fresh hello! If we had a team name, what would it be?', 'There you are! Ready for a little win and some good company?');
function chooseWelcome(kind, now, previous = '', random = Math.random) {
  const pool = kind === 'return' ? returns : now.getHours() < 12 ? morning : later;
  const choices = pool.filter(text => text !== previous);
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
}

class WelcomeManager {
  constructor(store, { now = () => new Date(), random = Math.random } = {}) {
    this.store = store; this.now = now; this.random = random;
    this.locked = false; this.suspended = false; this.awaySince = null; this.pending = null;
  }
  get away() { return this.locked || this.suspended; }
  active() {
    if (this.away || !this.store.snapshot().settings.hatched) return false;
    const now = this.now(), history = this.store.snapshot().welcomes, day = localDay(now, 5);
    const since = this.awaySince ?? (history.lastSeenAt || now.getTime());
    const daily = now.getHours() >= 5 && history.day !== day;
    const returning = now.getTime() - since >= HOUR || history.lastGreetingAt === 0;
    if (daily) this.pending = { kind: 'daily', day };
    else if (returning && !this.pending) this.pending = { kind: 'return', day };
    this.store.saveWelcome({ lastSeenAt: now.getTime() });
    this.awaySince = null;
    return !!this.pending;
  }
  leave(kind) {
    const wasAway = this.away;
    if (kind === 'lock') this.locked = true;
    else this.suspended = true;
    if (!wasAway) {
      this.awaySince = this.now().getTime();
      this.store.saveWelcome({ lastSeenAt: this.awaySince });
    }
  }
  back(kind) {
    if (kind === 'unlock') this.locked = false;
    else this.suspended = false;
    return this.active();
  }
  take() {
    if (!this.pending || this.away || !this.store.snapshot().settings.hatched) return null;
    const now = this.now(), history = this.store.snapshot().welcomes;
    const daily = now.getHours() >= 5 && history.day !== localDay(now, 5);
    const kind = daily ? 'daily' : this.pending.kind === 'daily' && now.getHours() < 5 ? 'return' : this.pending.kind;
    const text = chooseWelcome(kind, now, history.lastMessage, this.random);
    this.store.saveWelcome({ day: kind === 'daily' ? localDay(now, 5) : history.day, lastSeenAt: now.getTime(), lastGreetingAt: now.getTime(), lastMessage: text });
    this.pending = null;
    const motion = kind === 'daily' ? 'dance' : ['dance', 'welcome-bounce', 'wiggle'][Math.min(2, Math.floor(this.random() * 3))];
    return { kind, text, motion };
  }
  firstHello() {
    const now = this.now();
    this.store.saveWelcome({ day: now.getHours() >= 5 ? localDay(now, 5) : this.store.snapshot().welcomes.day, lastSeenAt: now.getTime(), lastGreetingAt: now.getTime() });
    this.pending = null;
    this.awaySince = null;
  }
  recordActive(active = true, force = false) {
    if (!active || !this.store.snapshot().settings.hatched) return;
    const now = this.away ? this.awaySince : this.now().getTime();
    if (now !== null && (force || (!this.away && now - this.store.snapshot().welcomes.lastSeenAt >= 5 * 60000))) this.store.saveWelcome({ lastSeenAt: now });
  }
}
module.exports = { WelcomeManager, chooseWelcome, HOUR };
