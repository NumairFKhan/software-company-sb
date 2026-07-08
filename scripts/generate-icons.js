#!/usr/bin/env node
/**
 * generate-icons.js
 *
 * Creates solid-colour PNG icons for the CourtCoach AI PWA using only
 * Node.js built-in modules (no external dependencies).
 *
 * Usage:
 *   node scripts/generate-icons.js
 *
 * Output:
 *   public/icons/icon-192x192.png
 *   public/icons/icon-512x512.png
 */

'use strict';

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// ── CRC32 (required by PNG chunk format) ─────────────────────────────────────

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[i] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ── PNG chunk builder ─────────────────────────────────────────────────────────

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.allocUnsafe(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// ── Solid-colour PNG creator ──────────────────────────────────────────────────

function createSolidColorPNG(size, r, g, b) {
  // PNG magic bytes
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR: width, height, bit-depth=8, color-type=2 (RGB), compression=0, filter=0, interlace=0
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Raw scanlines: filter_byte(0x00) + R G B per pixel, per row
  const stride = 1 + size * 3;
  const raw = Buffer.allocUnsafe(stride * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * stride;
    raw[rowStart] = 0; // filter type: None
    for (let x = 0; x < size; x++) {
      const px = rowStart + 1 + x * 3;
      raw[px]     = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const OUT_DIR = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(OUT_DIR, { recursive: true });

// CourtCoach brand colour: #16a34a = rgb(22, 163, 74) — green-600
const R = 22, G = 163, B = 74;

const SIZES = [192, 512];
for (const size of SIZES) {
  const filename = `icon-${size}x${size}.png`;
  const outPath = path.join(OUT_DIR, filename);
  const png = createSolidColorPNG(size, R, G, B);
  fs.writeFileSync(outPath, png);
  console.log(`✓ Written ${outPath} (${png.length} bytes)`);
}

console.log('\nDone. PWA icons are ready in public/icons/');
