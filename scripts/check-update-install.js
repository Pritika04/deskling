'use strict';
// Run explicitly through npm run test:updates:install, separate from unit tests.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const assert = require('node:assert/strict');

if (process.platform !== 'win32') throw new Error('Run the Windows upgrade check on Windows.');
const workspace = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(workspace, '.npm'), { recursive: true });
const root = fs.mkdtempSync(path.join(workspace, '.npm', 'deskling-update-e2e-'));
const installDir = path.join(root, 'installed');
fs.mkdirSync(path.join(root, 'profile'));
const config = require('../electron-builder.json');
const product = 'Deskling Update Fixture';
const appId = `com.deskling.updatefixture.${randomUUID()}`;
let launched, server;
function inputHash() {
  const files = [];
  const collect = directory => { for (const entry of fs.readdirSync(directory, { withFileTypes: true })) { const file = path.join(directory, entry.name); if (entry.isDirectory()) collect(file); else files.push(file); } };
  collect(path.join(workspace, 'src')); collect(path.join(workspace, 'content'));
  files.push(...['package.json', 'package-lock.json', 'README.md', 'build/icon.png', 'scripts/update-fixture/main.js'].map(file => path.join(workspace, file)));
  const hash = createHash('sha256');
  for (const file of files.sort()) hash.update(file).update(fs.readFileSync(file));
  return hash.digest('hex');
}
function run(binary, args, extraEnv = {}, timeoutMs = 600000) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd: workspace, stdio: 'inherit', windowsHide: true, env: { ...process.env, ...extraEnv } });
    const timer = setTimeout(() => { child.kill(); reject(new Error(`${path.basename(binary)} timed out`)); }, timeoutMs);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`${path.basename(binary)} exited with ${code}`)); });
  });
}
const runInstaller = installer => run('powershell', ['-NoProfile', '-Command', '$result = Start-Process -FilePath $env:DESKLING_FIXTURE_INSTALLER -ArgumentList @("/S", "/D=$env:DESKLING_FIXTURE_DIRECTORY") -WindowStyle Hidden -Wait -PassThru; exit $result.ExitCode'], { DESKLING_FIXTURE_INSTALLER: installer, DESKLING_FIXTURE_DIRECTORY: installDir });

(async () => {
  const newerOutput = path.join(root, '0.0.2');
  server = http.createServer((request, response) => {
    const file = path.basename(new URL(request.url, 'http://127.0.0.1').pathname);
    if (file !== 'latest.yml' && file !== 'DesklingUpdateFixture-0.0.2.exe' && file !== 'DesklingUpdateFixture-0.0.2.exe.blockmap') { response.writeHead(404); response.end(); return; }
    const source = path.join(newerOutput, file);
    if (!fs.existsSync(source)) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'Content-Length': fs.statSync(source).size }); fs.createReadStream(source).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const sourceHash = inputHash();
    for (const version of ['0.0.1', '0.0.2']) {
      const fixture = structuredClone(config);
      fixture.appId = appId; fixture.productName = product;
      fixture.compression = 'store';
      fixture.artifactName = 'DesklingUpdateFixture-${version}.${ext}';
      fixture.directories = { output: path.join(root, version), buildResources: path.join(workspace, 'build') };
      fixture.files.push({ from: path.join(__dirname, 'update-fixture'), to: 'update-fixture', filter: ['main.js'] });
      fixture.extraMetadata = { version, main: 'update-fixture/main.js', desklingUpdateFixtureRoot: root };
      fixture.win.executableName = 'DesklingUpdateFixture';
      fixture.win.publish = [{ provider: 'generic', url: `http://127.0.0.1:${server.address().port}/` }];
      fixture.nsis.createDesktopShortcut = false; fixture.nsis.createStartMenuShortcut = false; fixture.nsis.runAfterFinish = false;
      fixture.nsis.shortcutName = `${product} ${path.basename(root)}`;
      const filename = path.join(root, `${version}.json`); fs.writeFileSync(filename, JSON.stringify(fixture));
      console.log(`Building isolated upgrade fixture ${version}…`);
      await run(process.execPath, [path.join(workspace, 'node_modules', 'electron-builder', 'cli.js'), '--config', filename, '--win', '--x64', '--publish', 'never']);
      if (inputHash() !== sourceHash) throw new Error('Project files changed during packaging. Rerun the fixture check without editing source files.');
      const asar = await import('@electron/asar');
      const metadata = JSON.parse(asar.extractFile(path.join(root, version, 'win-unpacked', 'resources', 'app.asar'), 'package.json').toString());
      assert.equal(metadata.version, version);
      if (version === '0.0.1') {
        console.log('Checking fixture startup before building the upgrade…');
        await run(path.join(root, version, 'win-unpacked', 'DesklingUpdateFixture.exe'), ['--fixture-preflight'], {}, 30000);
        assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'preflight.json'), 'utf8')).version, version);
      }
    }
    console.log('Installing isolated fixture 0.0.1; it will request and apply 0.0.2…');
    await runInstaller(path.join(root, '0.0.1', 'DesklingUpdateFixture-0.0.1.exe'));
    launched = spawn(path.join(installDir, 'DesklingUpdateFixture.exe'), [], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    launched.stdout.on('data', data => process.stdout.write(data));
    launched.stderr.on('data', data => process.stderr.write(data));
    const deadline = Date.now() + 120000, resultFile = path.join(root, 'result.json');
    while (!fs.existsSync(resultFile)) {
      if (Date.now() > deadline) {
        const stageFile = path.join(root, 'stage.json');
        throw new Error('Version upgrade did not finish. Last stage: ' + (fs.existsSync(stageFile) ? fs.readFileSync(stageFile, 'utf8') : 'entry point not reached'));
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
    if (result.error) throw new Error(result.error);
    assert.equal(result.version, '0.0.2'); assert.equal(result.preserved, true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('REAL UPDATE INSTALL CHECK PASSED: 0.0.1 → 0.0.2, automatic restart, and preserved buddy name, habits, progress, coins, outfit, size, and position.');
  } finally {
    launched?.kill();
    if (fs.existsSync(installDir)) {
      const name = fs.readdirSync(installDir).find(file => /^Uninstall.*\.exe$/.test(file));
      if (name) await run('powershell', ['-NoProfile', '-Command', '$result = Start-Process -FilePath $env:DESKLING_FIXTURE_UNINSTALLER -ArgumentList @("/S", "_?=$env:DESKLING_FIXTURE_DIRECTORY") -WindowStyle Hidden -Wait -PassThru; exit $result.ExitCode'], { DESKLING_FIXTURE_UNINSTALLER: path.join(installDir, name), DESKLING_FIXTURE_DIRECTORY: installDir });
    }
    const closed = new Promise(resolve => server.close(resolve)); server.closeAllConnections(); await closed;
    const resolved = path.resolve(root), expectedParent = path.join(workspace, '.npm');
    if (path.dirname(resolved) !== expectedParent || !path.basename(resolved).startsWith('deskling-update-e2e-')) throw new Error('Refusing unexpected fixture cleanup path');
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
