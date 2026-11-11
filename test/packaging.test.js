'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { generateIcons } = require('../scripts/generate-icons');
const { writeChecksums } = require('../scripts/checksums');
const config = require('../electron-builder.json');
const { APP_ID } = require('../src/app-identity');
const { version } = require('../package.json');

function directory(t) {
  const result = fs.mkdtempSync(path.join(os.tmpdir(), 'deskling-package-'));
  t.after(() => fs.rmSync(result, { recursive: true, force: true })); return result;
}

test('generated app icons contain a 1024px PNG and valid multi-size Windows/macOS containers', t => {
  const output = directory(t); generateIcons(output);
  const png = fs.readFileSync(path.join(output, 'icon.png'));
  assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), 1024); assert.equal(png.readUInt32BE(20), 1024);
  const ico = fs.readFileSync(path.join(output, 'icon.ico'));
  assert.equal(ico.readUInt16LE(2), 1); assert.equal(ico.readUInt16LE(4), 6);
  for (let i = 0; i < 6; i++) {
    const entry = 6 + i * 16, offset = ico.readUInt32LE(entry + 12), length = ico.readUInt32LE(entry + 8);
    assert.ok(offset + length <= ico.length);
    assert.equal(ico.toString('hex', offset, offset + 8), '89504e470d0a1a0a');
    assert.equal(ico.readUInt32BE(offset + 16), ico[entry] || 256);
  }
  const icns = fs.readFileSync(path.join(output, 'icon.icns'));
  assert.equal(icns.toString('ascii', 0, 4), 'icns'); assert.equal(icns.readUInt32BE(4), icns.length);
  const types = []; let offset = 8;
  while (offset < icns.length) { types.push(icns.toString('ascii', offset, offset + 4)); offset += icns.readUInt32BE(offset + 4); }
  assert.equal(offset, icns.length); assert.ok(types.includes('ic10'));
});

test('checksums cover current installation files, excluding other versions and development data', t => {
  const output = directory(t), platform = { win32: 'win', darwin: 'mac', linux: 'linux' }[process.platform];
  const name = `Deskling-${version}-${platform}-${process.arch}.exe`, data = Buffer.from('a test installation file');
  fs.writeFileSync(path.join(output, name), data);
  fs.writeFileSync(path.join(output, 'habit-buddy.json'), 'private data');
  fs.writeFileSync(path.join(output, 'Deskling-0.0.0-win-x64.exe'), 'old build');
  const manifest = writeChecksums(output);
  assert.equal(fs.readFileSync(manifest, 'utf8'), `${createHash('sha256').update(data).digest('hex')}  ${name}\n`);
  fs.writeFileSync(path.join(output, `Deskling-${version}-mac-arm64.dmg`), 'another platform');
  const combined = writeChecksums(output, { all: true });
  assert.equal(fs.readFileSync(combined, 'utf8').trim().split('\n').length, 2);
});

test('missing installation files cannot produce a misleading successful manifest', t => {
  assert.throws(() => writeChecksums(directory(t)), /No Deskling installation files/);
});

test('Linux checksums include both the x86_64 AppImage and x64 tarball', t => {
  const output = directory(t);
  const names = [`Deskling-${version}-linux-x86_64.AppImage`, `Deskling-${version}-linux-x64.tar.gz`];
  for (const name of names) fs.writeFileSync(path.join(output, name), name);
  fs.writeFileSync(path.join(output, `Deskling-${version}-linux-arm64.AppImage`), 'other architecture');
  const manifest = writeChecksums(output, { platform: 'linux', arch: 'x64' });
  const expected = names.sort().map(name => `${createHash('sha256').update(name).digest('hex')}  ${name}`).join('\n') + '\n';
  assert.equal(fs.readFileSync(manifest, 'utf8'), expected);
});

test('packaging retains the existing OS identity and user data without shipping local screenshots', () => {
  assert.equal(config.appId, APP_ID);
  assert.equal(config.nsis.deleteAppDataOnUninstall, false);
  assert.equal(config.nsis.perMachine, false);
  assert.equal(config.asar, true);
  assert.deepEqual(config.files, ['src/**/*', 'content/**/*', 'build/icon.png', 'package.json', 'README.md']);
});
