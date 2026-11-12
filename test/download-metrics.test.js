'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { summarizeDownloads, fetchReleases } = require('../scripts/download-metrics');
const release = (version, assets, extra = {}) => ({ tag_name: `v${version}`, assets: assets.map(([name, download_count]) => ({ name: `Deskling-${version}-${name}`, download_count })), ...extra });

test('counts app downloads across platforms and formats without counting update checks or metadata', () => {
  const report = summarizeDownloads([
    release('0.1.9', [['win-x64.exe', 3], ['win-x64.exe.blockmap', 7], ['mac-arm64.dmg', 2], ['mac-x64.zip', 1], ['linux-x86_64.AppImage', 4], ['linux-x64.tar.gz', 5], ['win-x64.zip', 99]]),
    release('0.1.8', [['win-x64.exe', 2]]),
    release('0.2.0', [['win-x64.exe', 100]], { draft: true }),
    release('0.3.0', [['win-x64.exe', 100]], { prerelease: true }),
    { tag_name: 'v0.4.0', assets: [{ name: 'latest.yml', download_count: 900 }, { name: 'SHA256SUMS-win-x64.txt', download_count: 20 }] },
  ]);
  assert.deepEqual(report.platforms, { Windows: 5, macOS: 3, Linux: 9 });
  assert.equal(report.total, 17);
  assert.equal(report.versions.find(row => row.version === '0.1.9').files.length, 5);
  assert.equal(report.versions[0].version, '0.4.0');
});

test('does not silently turn missing or invalid counts into successful totals', () => {
  for (const count of [undefined, -1, NaN]) assert.throws(() => summarizeDownloads([release('0.1.9', [['win-x64.exe', count]])]), /Invalid download count/);
});

test('fetches subsequent release pages and fails clearly for rate limits', async () => {
  const urls = [];
  const data = await fetchReleases(async url => { urls.push(url); return { ok: true, json: async () => urls.length === 1 ? Array.from({ length: 100 }, (_, i) => ({ tag_name: `v0.1.${i}` })) : [{ tag_name: 'v0.2.0' }] }; });
  assert.equal(data.length, 101); assert.ok(urls[1].endsWith('page=2'));
  await assert.rejects(fetchReleases(async () => ({ ok: false, status: 403 })), /HTTP 403/);
});
