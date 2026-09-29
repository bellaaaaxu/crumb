/* The home-screen icon: a manifest that keeps it opening in the browser, and real PNG icons. */
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { rawGet, startServer } from './helpers.mjs';

test('the manifest and icons are served, and the icon opens in the browser', async t => {
  const server = await startServer(t);
  const manifest = await rawGet(server.base, '/manifest.webmanifest');
  assert.equal(manifest.status, 200);
  assert.match(manifest.headers['content-type'], /^application[/]manifest[+]json/);
  const body = JSON.parse(manifest.text);
  // A separate web app would keep its own storage, and so start signed out.
  assert.equal(body.display, 'browser');
  assert.equal(body.start_url, '/');
  const index = await rawGet(server.base, '/');
  assert.match(index.text, /<link rel="manifest" href="[/]manifest[.]webmanifest">/);
  assert.match(index.text, /<link rel="apple-touch-icon" href="[/]icons[/]icon-180[.]png">/);
  const icons = [['/icons/icon-180.png', 180], ...body.icons.map(icon => [icon.src, Number(icon.sizes.split('x')[0])])];
  assert.deepEqual(icons.map(([, size]) => size), [180, 192, 512]);
  for (const [path, size] of icons) {
    const response = await fetch(server.base + path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('content-type'), 'image/png', path);
    const meta = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    assert.deepEqual([meta.format, meta.width, meta.height], ['png', size, size], path);
  }
});
