const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c;
  }
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeB = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeB, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData));
  return Buffer.concat([len, typeB, data, crc]);
}

function createPNG(width, height, pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // filter none
    for (let x = 0; x < width; x++) {
      const off = y * (1 + width * 4) + 1 + x * 4;
      const pi = (y * width + x) * 4;
      raw[off] = pixels[pi];
      raw[off + 1] = pixels[pi + 1];
      raw[off + 2] = pixels[pi + 2];
      raw[off + 3] = pixels[pi + 3];
    }
  }
  const compressed = zlib.deflateSync(raw);
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', compressed), pngChunk('IEND', Buffer.alloc(0))]);
}

function drawCircle(arr, w, h, cx, cy, r, cr, cg, cb, ca) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= r) {
        const off = (y * w + x) * 4;
        arr[off] = cr; arr[off + 1] = cg; arr[off + 2] = cb; arr[off + 3] = ca;
      }
    }
  }
}

function drawText(arr, w, h, cx, cy, text, size, cr, cg, cb) {
  // Simple 8-segment display for numbers
  const segMap = {
    '8': [1,1,1,1,1,1,1],
    '0': [1,1,1,1,1,1,0],
    '1': [0,1,1,0,0,0,0],
  };
  const seg = segMap[text] || [1,1,1,1,1,1,1];
  const segW = size * 0.4;
  const segH = size * 0.1;
  const segGap = size * 0.05;
  // segments: top, top-right, bottom-right, bottom, bottom-left, top-left, middle
  const segDefs = [
    { x: cx - segW/2, y: cy - size*0.45, w: segW, h: segH }, // top
    { x: cx + size*0.05, y: cy - size*0.4, w: segH, h: segW }, // top-right
    { x: cx + size*0.05, y: cy + size*0.05, w: segH, h: segW }, // bottom-right
    { x: cx - segW/2, y: cy + size*0.35, w: segW, h: segH }, // bottom
    { x: cx - size*0.4 - segH, y: cy + size*0.05, w: segH, h: segW }, // bottom-left
    { x: cx - size*0.4 - segH, y: cy - size*0.4, w: segH, h: segW }, // top-left
    { x: cx - segW/2, y: cy - segH/2, w: segW, h: segH }, // middle
  ];
  for (let i = 0; i < 7; i++) {
    if (!seg[i]) continue;
    const d = segDefs[i];
    for (let py = Math.max(0, Math.floor(d.y)); py < Math.min(h, Math.ceil(d.y + d.h)); py++) {
      for (let px = Math.max(0, Math.floor(d.x)); px < Math.min(w, Math.ceil(d.x + d.w)); px++) {
        const off = (py * w + px) * 4;
        arr[off] = cr; arr[off+1] = cg; arr[off+2] = cb; arr[off+3] = 255;
      }
    }
  }
}

function generateIcon(size) {
  const w = size, h = size;
  const pixels = new Uint8Array(w * h * 4);
  // transparent bg
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 0; pixels[i + 1] = 0; pixels[i + 2] = 0; pixels[i + 3] = 0;
  }
  const cx = w / 2, cy = h / 2;
  const ballR = w * 0.38;
  // ball shadow
  drawCircle(pixels, w, h, cx + 3, cy + 3, ballR, 0, 0, 0, 80);
  // ball body
  drawCircle(pixels, w, h, cx, cy, ballR, 30, 30, 30, 255);
  // ball highlight
  drawCircle(pixels, w, h, cx - ballR * 0.2, cy - ballR * 0.25, ballR * 0.5, 255, 255, 255, 50);
  // number circle
  const numR = ballR * 0.45;
  drawCircle(pixels, w, h, cx, cy, numR, 255, 255, 255, 255);
  // number
  const numSize = ballR * 0.7;
  drawText(pixels, w, h, cx, cy, '8', numSize, 30, 30, 30);
  return createPNG(w, h, pixels);
}

const outDir = path.join(__dirname, '..', 'public', 'icons');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const sizes = [192, 512];
for (const size of sizes) {
  const png = generateIcon(size);
  const outPath = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`Generated ${outPath} (${png.length} bytes)`);
}
console.log('Done!');
