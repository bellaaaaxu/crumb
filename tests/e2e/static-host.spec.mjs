/* GitHub Pages publishes the whole repository as static files under /crumb/, the app folder
 * included, with no Crumb server behind it. That page must say what it is, not look broken. */
import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json',
};

/* Like GitHub Pages for a project site: the repository at /crumb/, a 404 page anywhere else. */
async function pagesSite() {
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://pages.test').pathname;
    const inside = path.startsWith('/crumb/') ? decodeURIComponent(path.slice('/crumb/'.length)) : null;
    const file = inside === null ? null : join(ROOT, inside === '' || inside.endsWith('/') ? `${inside}index.html` : inside);
    try {
      if (!file) throw new Error('outside the site');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/html' }).end('<h1>404 File not found</h1>');
    }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(done => server.close(done)) };
}

test('the app folder on a static site says it needs its own server, with the way to the demo and to deploying', async ({ page }) => {
  const site = await pagesSite();
  try {
    const missing = [];
    page.on('response', response => {
      if (response.status() === 404 && !response.url().endsWith('/api/session')) missing.push(response.url());
    });
    await page.goto(`${site.base}/crumb/app/`);
    await expect(page.getByRole('heading', { name: 'Crumb runs on a server of your own' })).toBeVisible();
    const demo = page.getByRole('link', { name: 'Try the demo', exact: true });
    await expect(demo).toHaveAttribute('href', '../');
    await demo.click();
    await expect(page).toHaveURL(`${site.base}/crumb/`);
    await page.goBack();
    await expect(page.getByRole('link', { name: 'How to run it for your team', exact: true }))
      .toHaveAttribute('href', 'https://github.com/bellaaaaxu/crumb#readme');
    expect(missing, 'every file the page asks for is there').toEqual([]);
  } finally {
    await site.close();
  }
});
