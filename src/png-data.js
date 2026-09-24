// Exact 8-bit PNG decoding for baked data (heights must not pass through a
// colour-managed, premultiplied canvas). Uses the browser's zlib stream.
export function unfilterPNG(raw, width, height, channels) {
  const stride = width * channels, pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], row = y * (stride + 1) + 1, out = y * stride;
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? pixels[out + i - channels] : 0;
      const up = y ? pixels[out - stride + i] : 0;
      const corner = y && i >= channels ? pixels[out - stride + i - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - corner, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - corner);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : corner;
      }
      pixels[out + i] = (raw[row + i] + predictor) & 0xff;
    }
  }
  return pixels;
}

export function parsePNGChunks(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8, width = 0, height = 0, channels = 0, length = 0;
  const data = [];
  while (offset < bytes.length) {
    const size = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const body = bytes.subarray(offset + 8, offset + 8 + size);
    if (type === 'IHDR') {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      channels = { 0: 1, 2: 3, 6: 4 }[body[9]];
      if (body[8] !== 8 || !channels || body[12]) throw new Error('Unsupported PNG data layout');
    } else if (type === 'IDAT') { data.push(body); length += size; }
    offset += 12 + size;
  }
  const compressed = new Uint8Array(length);
  let at = 0;
  for (const part of data) { compressed.set(part, at); at += part.length; }
  return { width, height, channels, compressed };
}

export async function loadPNGData(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const { width, height, channels, compressed } = parsePNGChunks(new Uint8Array(await response.arrayBuffer()));
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate'));
  const raw = new Uint8Array(await new Response(stream).arrayBuffer());
  return { width, height, channels, pixels: unfilterPNG(raw, width, height, channels) };
}
