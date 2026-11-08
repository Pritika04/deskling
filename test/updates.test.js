'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { UpdateManager } = require('../src/updates');

class FakeUpdater extends EventEmitter {
  constructor() { super(); this.checks = 0; this.downloads = 0; this.installs = []; this.version = '0.2.0'; }
  async checkForUpdates() { this.checks++; this.emit('update-available', { version: this.version }); return {}; }
  async downloadUpdate() { this.downloads++; this.emit('download-progress', { percent: 48.6 }); this.emit('update-downloaded', { version: this.version }); return ['verified-installer.exe']; }
  quitAndInstall(...args) { this.installs.push(args); }
}
function setup(t, options = {}) {
  const updater = new FakeUpdater(), changes = [];
  const manager = new UpdateManager({ updater, version: '0.1.0', onChange: state => changes.push(state), ...options });
  t.after(() => manager.dispose());
  return { updater, manager, changes };
}

test('checking never downloads or installs; only an explicit ready action saves and restarts', async t => {
  let saves = 0;
  const { updater, manager, changes } = setup(t, { beforeInstall: () => saves++ });
  assert.equal(updater.autoDownload, false); assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updater.allowDowngrade, false); assert.equal(updater.allowPrerelease, false);
  assert.equal(updater.disableWebInstaller, true);
  assert.equal(manager.install(), false);
  await manager.check();
  assert.equal(manager.snapshot().stage, 'available');
  assert.equal(updater.downloads, 0); assert.deepEqual(updater.installs, []);
  assert.equal(manager.install(), false);
  await manager.download();
  assert.ok(changes.some(state => state.stage === 'downloading' && state.percent === 49));
  assert.equal(manager.snapshot().stage, 'downloaded'); assert.equal(saves, 0);
  assert.equal(manager.install(), true); assert.equal(manager.install(), false);
  assert.equal(saves, 1); assert.deepEqual(updater.installs, [[true, true]]);
});

test('Later hides the badge for that version without discarding the update or installing it', async t => {
  const { updater, manager } = setup(t);
  await manager.check(); assert.equal(manager.snapshot().attention, true);
  manager.later(); await manager.check();
  assert.equal(manager.snapshot().attention, false); assert.equal(manager.snapshot().version, '0.2.0');
  updater.version = '0.3.0'; await manager.check(); assert.equal(manager.snapshot().attention, true);
  await manager.download(); manager.later();
  assert.equal(manager.snapshot().stage, 'downloaded'); assert.equal(manager.snapshot().attention, false);
  assert.deepEqual(updater.installs, []);
});

test('older, equal, malformed, and prerelease versions cannot become installable updates', async t => {
  const { updater, manager } = setup(t);
  for (const version of ['0.0.9', '0.1.0', '0.2.0-beta.1', 'not-a-version']) {
    updater.version = version; await manager.check();
    assert.equal(manager.snapshot().stage, 'up-to-date');
    await manager.download(); assert.equal(manager.install(), false);
  }
  assert.equal(updater.downloads, 0);
});

test('offline checks and unpublished releases stay nonfatal and can be retried', async t => {
  const { updater, manager } = setup(t);
  updater.checkForUpdates = async () => { throw new Error('ECONNRESET'); };
  await manager.check(); assert.equal(manager.snapshot().stage, 'error');
  assert.match(manager.snapshot().message, /connection/);
  updater.checkForUpdates = async () => { throw Object.assign(new Error('404'), { code: 'ERR_UPDATER_NO_PUBLISHED_VERSIONS' }); };
  await manager.check(); assert.equal(manager.snapshot().stage, 'unavailable');
  assert.equal(manager.snapshot().attention, false);
  updater.checkForUpdates = async () => { updater.emit('update-not-available', { version: '0.1.0' }); return {}; };
  await manager.check(); assert.equal(manager.snapshot().stage, 'up-to-date');
});

test('a failed or corrupt download is never ready to install, and retry succeeds', async t => {
  const { updater, manager } = setup(t);
  await manager.check();
  updater.downloadUpdate = async () => { throw Object.assign(new Error('sha512 mismatch'), { code: 'ERR_CHECKSUM_MISMATCH' }); };
  await manager.download(); assert.equal(manager.snapshot().stage, 'available');
  assert.match(manager.snapshot().message, /could not be verified/); assert.equal(manager.install(), false);
  updater.downloadUpdate = FakeUpdater.prototype.downloadUpdate;
  await manager.download(); assert.equal(manager.snapshot().stage, 'downloaded');
});

test('failed saves block installation and retain the verified download for a retry', async t => {
  let fail = true;
  const { updater, manager } = setup(t, { beforeInstall: () => { if (fail) throw new Error('disk full'); } });
  await manager.check(); await manager.download();
  assert.equal(manager.install(), false); assert.equal(manager.snapshot().stage, 'downloaded');
  assert.match(manager.snapshot().message, /save your latest changes/); assert.equal(updater.installs.length, 0);
  fail = false; assert.equal(manager.install(), true);
});

test('an installer launch failure stays in the app and offers a fresh download', async t => {
  const { updater, manager } = setup(t);
  await manager.check(); await manager.download();
  updater.quitAndInstall = () => updater.emit('error', new Error('Could not execute installer'));
  assert.equal(manager.install(), false);
  assert.equal(manager.snapshot().stage, 'available');
  assert.match(manager.snapshot().message, /Could not install/);
  updater.quitAndInstall = FakeUpdater.prototype.quitAndInstall;
  await manager.download(); assert.equal(manager.install(), true);
});

test('checks and downloads cannot overlap or install an unfinished/mismatched update', async t => {
  const { updater, manager } = setup(t);
  let finishCheck, finishDownload;
  updater.checkForUpdates = () => { updater.checks++; return new Promise(resolve => { finishCheck = resolve; }); };
  const checking = manager.check(); await manager.check(); assert.equal(updater.checks, 1);
  updater.emit('update-available', { version: '0.2.0' }); finishCheck({}); await checking;
  updater.downloadUpdate = () => { updater.downloads++; return new Promise(resolve => { finishDownload = resolve; }); };
  const downloading = manager.download(); await manager.download(); await manager.check();
  assert.equal(updater.downloads, 1); assert.equal(updater.checks, 1);
  updater.emit('download-progress', { percent: 150 }); assert.equal(manager.snapshot().percent, 100);
  updater.emit('update-downloaded', { version: '0.9.0' }); assert.equal(manager.install(), false);
  updater.emit('update-downloaded', { version: '0.2.0' }); finishDownload([]); await downloading;
  assert.equal(manager.snapshot().stage, 'downloaded');
});

test('unsupported builds never contact an update server', async () => {
  const manager = new UpdateManager({ version: '0.1.0' });
  assert.equal((await manager.check()).stage, 'unsupported');
  assert.equal((await manager.download()).stage, 'unsupported'); assert.equal(manager.install(), false);
  manager.start(); manager.dispose();
});

test('automatic checks start after thirty seconds, repeat twelve-hourly, and stop on quit', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const { updater, manager } = setup(t);
  updater.checkForUpdates = async () => { updater.checks++; updater.emit('update-not-available'); return {}; };
  manager.start(); manager.start();
  t.mock.timers.tick(29999); assert.equal(updater.checks, 0);
  t.mock.timers.tick(1); assert.equal(updater.checks, 1);
  t.mock.timers.tick(12 * 60 * 60 * 1000 - 30000); assert.equal(updater.checks, 2);
  manager.dispose(); t.mock.timers.tick(12 * 60 * 60 * 1000); assert.equal(updater.checks, 2);
});
