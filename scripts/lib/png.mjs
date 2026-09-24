// Minimal dependency-free PNG encoding/decoding for baked terrain data.
// Only 8-bit RGB/RGBA images are needed; filters are decoded completely.
import { deflateSync, inflateSync } from 'node:zlib';
import { parsePNGChunks, unfilterPNG } from '../../src/png-data.js';

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

export function encodePNG(width, height, channels, pixels) {
  const stride = width * channels, raw = Buffer.alloc((stride + 1) * height);
  // The Paeth-free "up" filter compresses smooth height/light fields well.
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1);
    raw[row] = y ? 2 : 0;
    for (let i = 0; i < stride; i++) {
      const value = pixels[y * stride + i];
      raw[row + 1 + i] = y ? (value - pixels[(y - 1) * stride + i]) & 0xff : value;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = channels === 4 ? 6 : channels === 3 ? 2 : 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function decodePNG(buffer) {
  const { width, height, channels, compressed } = parsePNGChunks(new Uint8Array(buffer));
  return { width, height, channels, pixels: unfilterPNG(inflateSync(compressed), width, height, channels) };
}
