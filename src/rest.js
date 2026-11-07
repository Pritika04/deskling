'use strict';
const { performance } = require('node:perf_hooks');
const REST_AFTER = 10 * 60 * 1000;
const DAY_REST_AFTER = 45 * 60 * 1000;
function restAfterFor(date = new Date()) {
  return date.getHours() >= 6 && date.getHours() < 22 ? DAY_REST_AFTER : REST_AFTER;
}

class RestClock {
  constructor({ now = () => performance.now(), onChange = () => {}, schedule = setTimeout, cancel = clearTimeout, idleMs = REST_AFTER } = {}) {
    this.now = now; this.onChange = onChange; this.schedule = schedule; this.cancel = cancel; this.idleMs = idleMs;
    this.lastActivity = now(); this.sleeping = false; this.timer = null; this.stopped = false;
    this.arm();
  }
  arm() {
    this.cancel(this.timer);
    this.timer = this.schedule(() => this.check(), Math.max(1, this.timeoutMs - (this.now() - this.lastActivity)));
    this.timer?.unref?.();
  }
  get timeoutMs() { return typeof this.idleMs === 'function' ? this.idleMs() : this.idleMs; }
  check() {
    if (this.stopped) return this.sleeping;
    const sleeping = this.now() - this.lastActivity >= this.timeoutMs;
    if (sleeping !== this.sleeping) { this.sleeping = sleeping; this.onChange({ sleeping }); }
    if (sleeping) { this.cancel(this.timer); this.timer = null; }
    else this.arm();
    return sleeping;
  }
  touch() {
    if (this.stopped) return;
    this.lastActivity = this.now();
    this.check();
  }
  observeComputer(idleMs) {
    if (this.stopped) return;
    if (Number.isFinite(idleMs) && idleMs >= 0) this.lastActivity = Math.max(this.lastActivity, this.now() - idleMs);
    return this.check();
  }
  stop() { this.stopped = true; this.cancel(this.timer); this.timer = null; }
}
module.exports = { RestClock, REST_AFTER, DAY_REST_AFTER, restAfterFor };
