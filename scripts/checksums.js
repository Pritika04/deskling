'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { version } = require('../package.json');

function writeChecksums(directory = path.join(__dirname, '..', 'dist'), { all = false, arch = process.arch } = {}) {
  const platform = { win32: 'win', darwin: 'mac', linux: 'linux' }[process.platform];
  const files = fs.readdirSync(directory).filter(file => file.startsWith(`Deskling-${version}-`) && /\.(exe|dmg|zip|AppImage|tar\.gz)$/.test(file) && (all || file.startsWith(`Deskling-${version}-${platform}-${arch}.`))).sort();
  if (!files.length) throw new Error('No Deskling installation files found to checksum.');
  const lines = files.map(file => `${createHash('sha256').update(fs.readFileSync(path.join(directory, file))).digest('hex')}  ${file}`);
  const output = path.join(directory, all ? 'SHA256SUMS.txt' : `SHA256SUMS-${platform}-${arch}.txt`);
  fs.writeFileSync(output, lines.join('\n') + '\n');
  return output;
}
if (require.main === module) console.log(writeChecksums(undefined, { all: process.argv.includes('--all'), arch: process.argv.find(arg => arg.startsWith('--arch='))?.slice(7) || process.arch }));
module.exports = { writeChecksums };
