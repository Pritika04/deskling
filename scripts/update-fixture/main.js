'use strict';
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = require('../package.json').desklingUpdateFixtureRoot;
if (!root || !path.basename(root).startsWith('deskling-update-e2e-')) throw new Error('This entry point is only for isolated updater fixtures.');
const recordFailure = error => {
  fs.writeFileSync(path.join(root, 'result.json'), JSON.stringify({ error: error.stack || String(error) }));
  app.exit(1);
};
process.prependListener('uncaughtException', recordFailure);
process.prependListener('unhandledRejection', recordFailure);
const trace = stage => fs.writeFileSync(path.join(root, 'stage.json'), JSON.stringify({ version: app.getVersion(), stage }));
async function persistFixture(action) {
  for (let attempt = 0; ; attempt++) {
    try { return action(); }
    catch (error) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt >= 19) throw error;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
}
trace('entry loaded');
const { Store } = require('../src/store');
const { UpdateManager } = require('../src/updates');
app.setName('Deskling Update Fixture');
app.setPath('userData', path.join(root, 'profile'));
let manager;
app.on('window-all-closed', () => {});
app.on('before-quit', () => manager?.dispose());
app.whenReady().then(async () => {
  trace('app ready');
  if (process.argv.includes('--fixture-preflight')) {
    fs.writeFileSync(path.join(root, 'preflight.json'), JSON.stringify({ version: app.getVersion() }));
    app.quit(); return;
  }
  const store = new Store(path.join(app.getPath('userData'), 'habit-buddy.json'), { now: () => new Date(2026, 10, 8, 12) });
  if (app.getVersion() === '0.0.2') {
    assert.deepEqual(store.snapshot(), JSON.parse(fs.readFileSync(path.join(root, 'before.json'), 'utf8')));
    fs.writeFileSync(path.join(root, 'result.json'), JSON.stringify({ version: app.getVersion(), preserved: true }));
    app.quit(); return;
  }
  await persistFixture(() => store.nameBuddy('Clover'));
  const habit = await persistFixture(() => store.addHabit({ name: 'Water', type: 'count', goal: 8 }));
  await persistFixture(() => store.logProgress(habit.id, 4));
  const seed = store.snapshot(); seed.collection.coins = 20; await persistFixture(() => store.commit(seed));
  await persistFixture(() => store.buyAccessory('daisy-crown'));
  await persistFixture(() => store.updateSettings({ avatarSize: 92, avatarPosition: { x: 24, y: 36 } }));
  fs.writeFileSync(path.join(root, 'before.json'), JSON.stringify(store.snapshot()));
  const { autoUpdater } = require('electron-updater');
  // Keep the update cache isolated as well as the saved buddy profile.
  Object.defineProperty(autoUpdater.app, 'baseCachePath', { value: path.join(root, 'cache') });
  autoUpdater.logger = { info() {}, warn() {}, error: error => console.error(error) };
  manager = new UpdateManager({ updater: autoUpdater, version: app.getVersion(), onChange: info => trace(`${info.stage}: ${info.message}`), beforeInstall: () => store.updateSettings({ avatarPosition: { x: 24, y: 36 } }) });
  await manager.check(); assert.equal(manager.snapshot().stage, 'available');
  await manager.download(); assert.equal(manager.snapshot().stage, 'downloaded');
  if (!manager.install()) throw new Error('The verified fixture update did not begin installation');
}).catch(recordFailure);
