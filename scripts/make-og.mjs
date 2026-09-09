/* Builds assets/og.png — the social preview card.
 *
 * Link previews on LinkedIn, Slack and the rest need a raster image at a real
 * URL, and they do not accept SVG. Rather than draw one somewhere else, this
 * composes the card out of the same sprite table the site itself renders from,
 * so the preview cannot drift away from the page it is previewing.
 *
 * Run: node scripts/make-og.mjs
 * It is not part of serving the site — there is still no build step.
 */

import zlib from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

/* sprites.js touches no browser API at load time, so it evaluates here as-is. */
const Pixel = eval(readFileSync(join(root, 'assets/sprites.js'), 'utf8') + '\n;Pixel');

const W = 1200, H = 627;
const BG = [0xf2, 0xe7, 0xce];
const INK = [0x4a, 0x2f, 0x1b];
const SOFT = [0x8a, 0x6a, 0x4c];
const SLOT_BG = [0xef, 0xdc, 0xb6];
const SLOT_BORDER = [0xa9, 0x79, 0x3f];
const GRID = [0xea, 0xdd, 0xc0];

const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const buf = new Uint8Array(W * H * 3);
for (let i = 0; i < W * H; i += 1) { buf[i*3] = BG[0]; buf[i*3+1] = BG[1]; buf[i*3+2] = BG[2]; }

const px = (x, y, c) => {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const p = (y*W + x)*3; buf[p] = c[0]; buf[p+1] = c[1]; buf[p+2] = c[2];
};
const rect = (x, y, w, h, c) => { for (let j = y; j < y+h; j += 1) for (let i = x; i < x+w; i += 1) px(i, j, c); };

/* The page's faint background grid, same 24px pitch. */
for (let y = 0; y < H; y += 24) rect(0, y, W, 2, GRID);
for (let x = 0; x < W; x += 24) rect(x, 0, 2, H, GRID);

/* A sprite, centred by its own content bounds exactly as the site centres it. */
function sprite(key, x, y, scale) {
  const s = Pixel.SPRITES[key];
  const { dx, dy } = Pixel.offset(s);
  for (let r = 0; r < s.rows.length; r += 1) {
    for (let c = 0; c < s.rows[r].length; c += 1) {
      const colour = s.palette[s.rows[r][c]];
      if (!colour) continue;
      rect(x + (c + dx)*scale, y + (r + dy)*scale, scale, scale, hex(colour));
    }
  }
}

/* Pixel capitals and digits, same 3x5 grid and 1-column gap as the wordmark. */
function text(str, x, y, scale, colour) {
  const glyphs = Object.assign({}, Pixel.DIGITS, Pixel.LETTERS);
  let cursor = 0;
  for (const ch of str) {
    const g = glyphs[ch];
    if (g) {
      for (let r = 0; r < 5; r += 1) {
        for (let c = 0; c < 3; c += 1) {
          if (g[r][c] === '1') rect(x + (cursor + c)*scale, y + r*scale, scale, scale, colour);
        }
      }
    }
    cursor += 4;
  }
  return (str.length*4 - 1) * scale;
}
const textWidth = (str, scale) => (str.length*4 - 1) * scale;

/* ---- the card ---- */

/* App icon: a tile with the mascot in it, corners clipped so it reads as rounded. */
const TILE = 210, TX = 84, TY = 96;
rect(TX, TY, TILE, TILE, SLOT_BORDER);
rect(TX + 5, TY + 5, TILE - 10, TILE - 10, SLOT_BG);
for (let i = 0; i < 16; i += 1) {
  const n = 16 - i;
  rect(TX, TY + i, n, 1, BG);                     rect(TX + TILE - n, TY + i, n, 1, BG);
  rect(TX, TY + TILE - 1 - i, n, 1, BG);          rect(TX + TILE - n, TY + TILE - 1 - i, n, 1, BG);
}
sprite('laopo', TX + 33, TY + 33, 12);

/* Wordmark and strapline.
 *
 * fit() refuses rather than letting a line run off the edge — the glyphs are
 * fixed width, so a longer string silently overflows and gets cropped by the
 * canvas with nothing to show for it. Better to fail here than to ship a card
 * that reads "SOMETHING TO COLLE". */
const MARGIN = 40;
function fit(str, x, y, scale, colour) {
  const w = textWidth(str, scale);
  if (x + w > W - MARGIN) {
    throw new Error(`"${str}" at scale ${scale} needs ${x + w}px, past the ${W - MARGIN}px limit`);
  }
  text(str, x, y, scale, colour);
  return w;
}

const LX = TX + TILE + 56;
fit('CRUMB', LX, 132, 16, INK);
fit('STAFF CREDIT WITH SOMETHING TO COLLECT', LX + 3, 236, 5, SOFT);
fit('39 PASTRIES   0 DEPENDENCIES', LX + 3, 288, 5, SOFT);

/* A shelf of the real thing, first twelve of the rotation. */
const N = 12, CELL = 76, GAP = 12, SCALE = 5;
const rowW = N*CELL + (N - 1)*GAP;
const RX = Math.round((W - rowW) / 2), RY = 420;
for (let i = 0; i < N; i += 1) {
  const x = RX + i*(CELL + GAP);
  rect(x, RY, CELL, CELL, SLOT_BORDER);
  rect(x + 3, RY + 3, CELL - 6, CELL - 6, SLOT_BG);
  sprite(Pixel.CYCLE[i], x + 8, RY + 8, SCALE);
}

const caption = 'EVERY 50 DOLLARS RECEIVED UNLOCKS ONE THAT STAYS';
fit(caption, Math.round((W - textWidth(caption, 5)) / 2), RY + CELL + 34, 5, SOFT);

/* ---- PNG ---- */

const raw = Buffer.alloc(H*(1 + W*3));
let o = 0;
for (let y = 0; y < H; y += 1) {
  raw[o++] = 0;
  for (let x = 0; x < W; x += 1) { const p = (y*W + x)*3; raw[o++] = buf[p]; raw[o++] = buf[p+1]; raw[o++] = buf[p+2]; }
}
const tbl = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c>>>1) : c>>>1; return c>>>0; });
const crc = b => { let c = 0xffffffff; for (const v of b) c = tbl[(c^v) & 0xff] ^ (c>>>8); return (c ^ 0xffffffff)>>>0; };
const chunk = (type, d) => {
  const l = Buffer.alloc(4); l.writeUInt32BE(d.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), d]);
  const cc = Buffer.alloc(4); cc.writeUInt32BE(crc(td));
  return Buffer.concat([l, td, cc]);
};
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = join(root, 'assets/og.png');
writeFileSync(out, png);
console.log(`wrote ${out} — ${W}x${H}, ${(png.length/1024).toFixed(1)} KB`);
