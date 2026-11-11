'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { version } = require('../package.json');

function writeChecksums(directory = path.join(__dirname, '..', 'dist'), { all = false, arch = process.arch, platform = { win32: 'win', darwin: 'mac', linux: 'linux' }[process.platform] } = {}) {
  // AppImage uses x86_64 in its filename; the Linux tarball uses x64.
  const architectures = platform === 'linux' && arch === 'x64' ? ['x64', 'x86_64'] : [arch];
  const files = fs.readdirSync(directory).filter(file => file.startsWith(`Deskling-${version}-`) && /\.(exe|dmg|zip|AppImage|tar\.gz)$/.test(file) && (all || architectures.some(name => file.startsWith(`Deskling-${version}-${platform}-${name}.`)))).sort();
  if (!files.length) throw new Error('No Deskling installation files found to checksum.');
  const lines = files.map(file => `${createHash('sha256').update(fs.readFileSync(path.join(directory, file))).digest('hex')}  ${file}`);
  const output = path.join(directory, all ? 'SHA256SUMS.txt' : `SHA256SUMS-${platform}-${arch}.txt`);
  fs.writeFileSync(output, lines.join('\n') + '\n');
  return output;
}
if (require.main === module) console.log(writeChecksums(undefined, { all: process.argv.includes('--all'), arch: process.argv.find(arg => arg.startsWith('--arch='))?.slice(7) || process.arch }));
module.exports = { writeChecksums };
