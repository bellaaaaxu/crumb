/* Builds the home-screen icons in app/icons/ from the same sprite table the app draws from,
 * the way make-og.mjs builds the share card. Run: node scripts/make-icons.mjs
 * It is not part of serving the app — there is still no build step. */
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
/* sprites.js touches no browser API at load time, so it evaluates here as-is. */
const Pixel = eval(readFileSync(join(root, 'assets/sprites.js'), 'utf8') + '\n;Pixel');
const BACKGROUND = [0xf2, 0xe7, 0xce];
const hex = value => [1, 3, 5].map(at => parseInt(value.slice(at, at + 2), 16));

async function icon(size) {
  const pixels = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i += 1) pixels.set(BACKGROUND, i * 3);
  const sprite = Pixel.SPRITES.laopo;
  const scale = Math.floor((size * 0.72) / 12);
  const origin = Math.floor((size - 12 * scale) / 2);
  const { dx, dy } = Pixel.offset(sprite);
  sprite.rows.forEach((row, r) => [...row].forEach((key, c) => {
    const colour = sprite.palette[key];
    if (!colour) return;
    const rgb = hex(colour);
    for (let y = 0; y < scale; y += 1) {
      for (let x = 0; x < scale; x += 1) {
        pixels.set(rgb, ((origin + (r + dy) * scale + y) * size + origin + (c + dx) * scale + x) * 3);
      }
    }
  }));
  const out = join(root, 'app', 'icons', `icon-${size}.png`);
  await sharp(pixels, { raw: { width: size, height: size, channels: 3 } }).png().toFile(out);
  console.log(`wrote ${out}`);
}

mkdirSync(join(root, 'app', 'icons'), { recursive: true });
for (const size of [180, 192, 512]) await icon(size);
