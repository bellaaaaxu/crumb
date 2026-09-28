/* Invisible characters can make code read differently from how it runs
 * ("Trojan Source"), and they are easy to paste in by accident. None are
 * allowed in the project's text files: write them as escapes instead. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP = new Set(['node_modules', '.git', 'test-results', 'playwright-report', 'data', 'backups', '.secrets']);
const TEXT = new Set(['.mjs', '.js', '.cjs', '.json', '.md', '.html', '.css', '.sql', '.yaml', '.yml', '.sh', '.svg',
  '.txt', '.example', '']);
// Direction controls, zero-width characters and the byte-order mark — built from code points, so this file has none.
const RANGES = [[0x202A, 0x202E], [0x2066, 0x2069], [0x200B, 0x200F], [0x2060, 0x2060], [0xFEFF, 0xFEFF]];
const INVISIBLE = new RegExp(`[${RANGES.map(([from, to]) => `${String.fromCharCode(from)}-${String.fromCharCode(to)}`).join('')}]`);

function* textFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* textFiles(path);
    else if (TEXT.has(extname(entry.name))) yield path;
  }
}

test('no text file hides direction controls, zero-width characters or a byte-order mark', () => {
  const found = [];
  for (const file of textFiles(ROOT)) {
    readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
      if (INVISIBLE.test(line)) found.push(`${relative(ROOT, file)}:${index + 1}`);
    });
  }
  assert.deepEqual(found, []);
});
