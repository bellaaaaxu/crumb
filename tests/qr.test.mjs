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
