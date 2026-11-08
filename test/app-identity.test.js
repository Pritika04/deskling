'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { configureAppIdentity, DATA_FILE } = require('../src/app-identity');
const { Store } = require('../src/store');

function fakeApp(root) {
  return {
    name: 'habit-buddy', paths: {},
    setName(name) { this.name = name; },
    setPath(key, value) { this.paths[key] = value; },
    getPath(key) { return this.paths[key] || (key === 'userData' ? path.join(root, 'appData', this.name) : path.join(root, key)); },
  };
}

test('renaming the app retains its original data folder before acquiring the instance lock', () => {
  const app = fakeApp(os.tmpdir()), oldDirectory = app.getPath('userData');
  configureAppIdentity(app);
  assert.equal(app.name, 'Deskling');
  assert.equal(app.getPath('userData'), oldDirectory);
  configureAppIdentity(app);
  assert.equal(app.getPath('userData'), oldDirectory);
});

test('Deskling reopens the existing buddy, habits, progress, and collection without moving or rewriting saves', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deskling-identity-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = fakeApp(root), oldDirectory = app.getPath('userData');
  fs.mkdirSync(oldDirectory, { recursive: true });
  const oldFile = path.join(oldDirectory, 'habit-buddy.json');
  const options = { now: () => new Date(2026, 10, 7, 12) };
  const oldStore = new Store(oldFile, options);
  oldStore.nameBuddy('Miso');
  const habit = oldStore.addHabit({ name: 'Water', type: 'count', goal: 8 });
  oldStore.logProgress(habit.id, 4);
  const before = oldStore.snapshot(), bytes = fs.readFileSync(oldFile, 'utf8');
  configureAppIdentity(app);
  const newFile = path.join(app.getPath('userData'), DATA_FILE);
  assert.equal(newFile, oldFile);
  assert.deepEqual(new Store(newFile, options).snapshot(), before);
  assert.equal(fs.readFileSync(oldFile, 'utf8'), bytes);
  assert.equal(fs.existsSync(path.join(root, 'appData', 'Deskling')), false);
});

test('smoke runs keep unique temporary profiles separate from real buddy data', () => {
  const first = fakeApp(os.tmpdir()), second = fakeApp(os.tmpdir());
  configureAppIdentity(first, { isolated: true });
  configureAppIdentity(second, { isolated: true });
  assert.notEqual(first.getPath('userData'), second.getPath('userData'));
  assert.equal(path.dirname(first.getPath('userData')), first.getPath('temp'));
  assert.match(path.basename(first.getPath('userData')), /^deskling-smoke-/);
});
