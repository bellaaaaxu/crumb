/* QR codes for links: they must read back as exactly the link, or not be made at all. */
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { qrPng } from '../server/qr.mjs';
import { readQr } from './helpers.mjs';

const TOKEN = 'Zq4_Ve-1xLmN0pQrStUvWxYz0123456789abcdEFGHI';

test('a QR code reads back as exactly the link it was made from', async () => {
  const link = `https://crumb.example.com/#signin=${TOKEN}`;
  const qr = await qrPng(link);
  assert.match(qr, /^data:image[/]png;base64,/);
  assert.equal(await readQr(qr), link);
  const { width, height } = await sharp(Buffer.from(qr.slice(qr.indexOf(',') + 1), 'base64')).metadata();
  assert.equal(width, height);
  assert.ok(width >= 240, 'big enough to show at 240 pixels without blurring');
});

test('a long address still fits and reads back exactly', async () => {
  const link = `https://recognition.a-rather-long-organisation-name.example.org:8443/#invite=${TOKEN}`;
  assert.equal(await readQr(await qrPng(link)), link);
});

test('text too long for any QR code gives no picture instead of an error', async () => {
  assert.equal(await qrPng('x'.repeat(3000)), null);
});

test('the code is dark on light, with a white border four modules wide all round', async () => {
  const qr = await qrPng(`https://crumb.example.com/#signin=${TOKEN}`);
  const { data, info } = await sharp(Buffer.from(qr.slice(qr.indexOf(',') + 1), 'base64'))
    .greyscale().raw().toBuffer({ resolveWithObject: true });
  const at = (x, y) => data[y * info.width + x];
  const border = 4 * 8;
  let dark = 0;
  for (let i = 0; i < info.width; i += 1) {
    for (let d = 0; d < border; d += 1) {
      if (at(i, d) !== 255 || at(d, i) !== 255 || at(i, info.width - 1 - d) !== 255 || at(info.width - 1 - d, i) !== 255) dark += 1;
    }
  }
  assert.equal(dark, 0, 'nothing dark inside the border');
  assert.equal(at(border, border), 0, 'the corner pattern starts dark right after the border');
});

test('a QR code that cannot be made is logged by error type, never with the link', async () => {
  const lines = [];
  const link = `https://crumb.example.com/#signin=${TOKEN}${'x'.repeat(3000)}`;
  assert.equal(await qrPng(link, line => lines.push(line)), null);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /QR code/);
  assert.equal(lines[0].includes(TOKEN), false);
});
