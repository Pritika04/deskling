'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { Resvg } = require('@resvg/resvg-js');

function generateIcons(output = path.join(__dirname, '..', 'build')) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'build', 'icon.svg'));
  const png = size => Buffer.from(new Resvg(source, { fitTo: { mode: 'width', value: size } }).render().asPng());
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'icon.png'), png(1024));
  const sizes = [16, 32, 48, 64, 128, 256], images = sizes.map(png);
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  images.forEach((image, index) => {
    const entry = 6 + index * 16;
    header[entry] = sizes[index] % 256; header[entry + 1] = sizes[index] % 256;
    header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(image.length, entry + 8); header.writeUInt32LE(offset, entry + 12);
    offset += image.length;
  });
  fs.writeFileSync(path.join(output, 'icon.ico'), Buffer.concat([header, ...images]));
  const chunks = [[16, 'icp4'], [32, 'icp5'], [64, 'icp6'], [128, 'ic07'], [256, 'ic08'], [512, 'ic09'], [1024, 'ic10']].map(([size, type]) => {
    const image = png(size), chunk = Buffer.alloc(8);
    chunk.write(type, 0); chunk.writeUInt32BE(image.length + 8, 4);
    return Buffer.concat([chunk, image]);
  });
  const icns = Buffer.alloc(8); icns.write('icns', 0);
  icns.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4);
  fs.writeFileSync(path.join(output, 'icon.icns'), Buffer.concat([icns, ...chunks]));
}
if (require.main === module) { generateIcons(); console.log('Deskling app icons generated.'); }
module.exports = { generateIcons };
