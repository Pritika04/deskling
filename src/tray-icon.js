'use strict';

const { deflateSync } = require('node:zlib');

// Original tiny face, encoded as PNG in memory so no platform SVG decoder is needed.
module.exports = function trayIcon(nativeImage) {
  const size = 32;
  const pixels = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inside = (x - 15.5) ** 2 + (y - 15.5) ** 2 < 14 ** 2;
      const face = ((x === 11 || x === 20) && y >= 12 && y <= 15) || (y === 21 && x >= 13 && x <= 18);
      const offset = y * (1 + size * 4) + 1 + x * 4;
      pixels.set(face ? [255, 255, 255, 255] : [65, 82, 71, inside ? 255 : 0], offset);
    }
  }
  function chunk(type, data) {
    const body = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const byte of body) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, body, checksum]);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return nativeImage.createFromBuffer(Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0)),
  ]));
};
