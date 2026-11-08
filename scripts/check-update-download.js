'use strict';
// Explicit integration check: loopback-only Windows updater; nothing is installed.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { Transform } = require('node:stream');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const { NsisUpdater } = require('electron-updater');
const { ElectronHttpExecutor } = require('electron-updater/out/electronHttpExecutor');
const { UpdateManager } = require('../src/updates');
const { version } = require('../package.json');

const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'deskling-update-download-'));
app.setName('Deskling update test');
app.setPath('userData', path.join(root, 'shell'));
const fixture = path.join(__dirname, '..', 'dist', `Deskling-${version}-win-x64.exe`);
let server;
app.whenReady().then(async () => {
  if (process.platform !== 'win32') throw new Error('Run this Windows updater check on Windows.');
  const file = path.basename(fixture), size = fs.statSync(fixture).size;
  const sha512 = createHash('sha512').update(fs.readFileSync(fixture)).digest('base64');
  const manifest = `version: 999.0.0\nfiles:\n  - url: ${file}\n    sha512: ${sha512}\n    size: ${size}\npath: ${file}\nsha512: ${sha512}\nreleaseDate: '2026-01-01T00:00:00.000Z'\n`;
  server = http.createServer((request, response) => {
    const route = new URL(request.url, 'http://127.0.0.1').pathname;
    if (route.endsWith('/latest.yml')) { response.writeHead(200, { 'Content-Type': 'text/yaml' }); response.end(manifest); return; }
    if (!route.endsWith('/' + file)) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'Content-Length': size, 'Content-Type': 'application/octet-stream' });
    const stream = fs.createReadStream(fixture);
    if (route.startsWith('/corrupt/')) {
      let first = true;
      stream.pipe(new Transform({ transform(chunk, _encoding, done) {
        if (first) { chunk = Buffer.from(chunk); chunk[0] ^= 1; first = false; }
        done(null, chunk);
      } })).pipe(response);
    } else stream.pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    for (const scenario of ['good', 'corrupt']) {
      const profile = path.join(root, scenario); fs.mkdirSync(profile);
      const config = path.join(profile, 'app-update.yml');
      fs.writeFileSync(config, 'updaterCacheDirName: deskling-fixture\n');
      const adapter = { version, name: 'Deskling fixture', isPackaged: true, appUpdateConfigPath: config,
        userDataPath: profile, baseCachePath: profile, whenReady: () => app.whenReady(),
        quit: () => { throw new Error('Fixture must never install or quit for an update'); }, relaunch() {}, onQuit() {},
      };
      const client = new NsisUpdater(null, adapter);
      client.logger = { info() {}, warn() {}, error() {} };
      client.httpExecutor = new ElectronHttpExecutor();
      client.disableDifferentialDownload = true;
      client.setFeedURL({ provider: 'generic', url: `http://127.0.0.1:${server.address().port}/${scenario}/` });
      const manager = new UpdateManager({ updater: client, version });
      try {
        await manager.check(); assert.equal(manager.snapshot().stage, 'available');
        await manager.download();
        if (scenario === 'good') {
          assert.equal(manager.snapshot().stage, 'downloaded');
          assert.equal(createHash('sha512').update(fs.readFileSync(client.installerPath)).digest('base64'), sha512);
        } else {
          assert.equal(manager.snapshot().stage, 'available');
          assert.match(manager.snapshot().message, /could not be verified/);
          assert.equal(manager.install(), false);
        }
      } finally { manager.dispose(); }
    }
    console.log('REAL UPDATER DOWNLOAD CHECK PASSED: release metadata, real installer download, checksum verification, and rejection of altered bytes. No installer was executed.');
  } finally {
    const closed = new Promise(resolve => server.close(resolve)); server.closeAllConnections(); await closed;
    for (const name of ['good', 'corrupt']) {
      const target = path.resolve(root, name);
      if (path.dirname(target) !== root || !path.basename(root).startsWith('deskling-update-download-')) throw new Error('Unexpected fixture cleanup path');
      fs.rmSync(target, { recursive: true, force: true });
    }
  }
  app.quit();
}).catch(error => { console.error(error); if (server) server.closeAllConnections(); app.exit(1); });
