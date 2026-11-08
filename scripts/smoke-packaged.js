'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.join(__dirname, '..', 'dist');
const binary = process.argv[2] || ({
  win32: path.join(root, 'win-unpacked', 'Deskling.exe'),
  darwin: path.join(root, process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'Deskling.app', 'Contents', 'MacOS', 'Deskling'),
  linux: path.join(root, 'linux-unpacked', 'deskling'),
})[process.platform];
if (!binary || !fs.existsSync(binary)) throw new Error('Build Deskling first, or pass the packaged executable path.');
const child = spawn(binary, ['--shop-test'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let output = '', timedOut = false;
child.stdout.on('data', data => { output += data; process.stdout.write(data); });
child.stderr.on('data', data => process.stderr.write(data));
const timer = setTimeout(() => { timedOut = true; child.kill(); }, 90000);
child.on('error', error => { clearTimeout(timer); console.error(error.message); process.exitCode = 1; });
child.on('close', code => {
  clearTimeout(timer);
  if (timedOut || code !== 0 || !output.includes('SHOP UI CHECK PASSED') || !output.includes('QUIT UI CHECK PASSED')) {
    console.error(timedOut ? 'Packaged app check timed out.' : 'Packaged app did not complete its UI check.');
    process.exitCode = 1;
  } else console.log('PACKAGED DESKLING CHECK PASSED: startup, bundled content, shop, outfits, isolated persistence, and quitting through Settings.');
});
