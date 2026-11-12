'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ManualUpdateManager, DOWNLOAD_PAGE } = require('../src/updates');
const { configureWorkspaces } = require('../src/workspaces');

function setup(t) {
  let release = { tag_name: 'v0.2.0', draft: false, prerelease: false, assets: [{ name: 'Deskling-0.2.0-mac-arm64.dmg', state: 'uploaded' }] };
  const requests = [], opened = [];
  const manager = new ManualUpdateManager({ version: '0.1.0', arch: 'arm64',
    fetchRelease: async (url, options) => { requests.push({ url, options }); return { ok: true, status: 200, json: async () => release }; },
    openDownloadPage: async url => { opened.push(url); },
  });
  t.after(() => manager.dispose());
  return { manager, requests, opened, release: value => { release = value; } };
}

test('Mac checks metadata and shows a badge, but opens only the fixed website after a click', async t => {
  const { manager, requests, opened } = setup(t);
  await manager.download(); assert.deepEqual(opened, []);
  const info = await manager.check();
  assert.equal(info.manual, true); assert.equal(info.stage, 'available'); assert.equal(info.attention, true);
  assert.equal(requests[0].url, 'https://api.github.com/repos/Pritika04/deskling/releases/latest');
  assert.equal(requests[0].options.credentials, 'omit');
  assert.deepEqual(opened, []); assert.equal(manager.install(), false);
  await manager.download(); assert.deepEqual(opened, [DOWNLOAD_PAGE]);
  assert.equal(manager.snapshot().attention, false); assert.equal(manager.snapshot().stage, 'available');
  assert.equal(manager.install(), false);
});

test('Later suppresses the same Mac release, but a newer release restores its badge', async t => {
  const { manager, release } = setup(t);
  await manager.check(); manager.later(); await manager.check();
  assert.equal(manager.snapshot().attention, false);
  release({ tag_name: 'v0.3.0', assets: [{ name: 'Deskling-0.3.0-mac-arm64.dmg', state: 'uploaded' }] });
  await manager.check(); assert.equal(manager.snapshot().attention, true);
});

test('a missing or wrong-chip Mac asset never announces an available update', async t => {
  const { manager, release, opened } = setup(t);
  for (const assets of [[], [{ name: 'Deskling-0.2.0-mac-x64.dmg', state: 'uploaded' }], [{ name: 'Deskling-0.2.0-mac-arm64.dmg', state: 'new' }]]) {
    release({ tag_name: 'v0.2.0', assets });
    await manager.check(); assert.equal(manager.snapshot().stage, 'unavailable'); assert.equal(manager.snapshot().attention, false);
    await manager.download(); assert.deepEqual(opened, []);
  }
});

test('equal and older versions do not notify, and malformed or preview releases are rejected', async t => {
  const { manager, release } = setup(t);
  for (const tag_name of ['v0.1.0', 'v0.0.9']) {
    release({ tag_name }); await manager.check(); assert.equal(manager.snapshot().stage, 'up-to-date');
  }
  for (const value of [{ tag_name: 'oops' }, { tag_name: 'v0.2.0-beta.1' }, { tag_name: 'v0.2.0', draft: true }, { tag_name: 'v0.2.0', prerelease: true }]) {
    release(value); await manager.check(); assert.equal(manager.snapshot().stage, 'error'); assert.equal(manager.snapshot().attention, false);
  }
});

test('offline, rate limits and browser failures are nonfatal and retryable', async t => {
  const { manager, opened } = setup(t);
  const originalFetch = manager.fetchRelease;
  manager.fetchRelease = async () => { throw Error('offline'); };
  await manager.check(); assert.equal(manager.snapshot().stage, 'error');
  manager.fetchRelease = async () => ({ ok: false, status: 429 });
  await manager.check(); assert.equal(manager.snapshot().stage, 'error');
  manager.fetchRelease = async () => ({ ok: false, status: 404 });
  await manager.check(); assert.equal(manager.snapshot().stage, 'unavailable');
  manager.fetchRelease = originalFetch; await manager.check();
  const originalOpen = manager.openDownloadPage;
  manager.openDownloadPage = async () => { throw Error('browser'); };
  await manager.download(); assert.equal(manager.snapshot().attention, true); assert.match(manager.snapshot().message, /Could not open/);
  manager.openDownloadPage = originalOpen; await manager.download(); assert.deepEqual(opened, [DOWNLOAD_PAGE]);
});

test('Mac automatic checks use the same quiet startup and twelve-hour schedule', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const { manager, requests } = setup(t);
  manager.start(); manager.start(); t.mock.timers.tick(30000); await Promise.resolve(); await Promise.resolve();
  assert.equal(requests.length, 1);
  t.mock.timers.tick(12 * 60 * 60 * 1000); await Promise.resolve(); await Promise.resolve();
  assert.equal(requests.length, 2);
  manager.dispose(); t.mock.timers.tick(12 * 60 * 60 * 1000); assert.equal(requests.length, 2);
});

test('all Mac floating windows join Spaces including fullscreen; other platforms are unchanged', () => {
  const calls = [];
  const window = { setVisibleOnAllWorkspaces: (...args) => calls.push(args) };
  configureWorkspaces(window, 'win32'); configureWorkspaces(window, 'linux'); assert.equal(calls.length, 0);
  configureWorkspaces(window, 'darwin');
  assert.deepEqual(calls, [[true, { visibleOnFullScreen: true, skipTransformProcessType: true }]]);
});
