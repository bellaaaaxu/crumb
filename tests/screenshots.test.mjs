/* scripts/screenshots.mjs: where its pictures go. Importing it takes no pictures and starts no
 * server; the pictures themselves are taken by running it by hand (CONTRIBUTING.md). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { outputFolder } from '../scripts/screenshots.mjs';

const README_FOLDER = fileURLToPath(new URL('../assets/screenshots', import.meta.url));

/* Runs `body` with the temporary directory moved to a new folder of this test's own, so a
 * crumb-screenshots-* folder already in the real one is never touched, and deletes it afterwards. */
function withTemporaryDirectory(t, body) {
  const own = mkdtempSync(join(tmpdir(), 'crumb-shots-check-'));
  const saved = { TMPDIR: process.env.TMPDIR, TMP: process.env.TMP, TEMP: process.env.TEMP };
  for (const name of Object.keys(saved)) process.env[name] = own;
  t.after(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    rmSync(own, { recursive: true, force: true });
  });
  assert.equal(tmpdir(), own, 'the temporary directory follows the environment');
  body(own);
}

test('another theme\'s pictures go to a new folder of their own in the temporary directory, never to one already there', t => {
  withTemporaryDirectory(t, temp => {
    // Someone else made a folder first at the name a fixed choice would use, with a file where
    // a picture would go. On a shared /tmp that file could be a link to one of yours.
    const planted = join(temp, 'crumb-screenshots-bakery');
    mkdirSync(planted);
    writeFileSync(join(planted, 'member.png'), 'not a picture');
    const first = outputFolder('bakery');
    const second = outputFolder('bakery');
    for (const folder of [first, second]) {
      assert.equal(dirname(folder), temp, folder);
      assert.match(basename(folder), /^crumb-screenshots-bakery-[A-Za-z0-9]{6}$/);
      assert.deepEqual(readdirSync(folder), [], `${folder} is new and empty`);
    }
    assert.notEqual(first, second, 'each run has a folder of its own');
    assert.deepEqual(readdirSync(planted), ['member.png']);
    assert.equal(readFileSync(join(planted, 'member.png'), 'utf8'), 'not a picture');
  });
});

test('--out is used as given and made if missing; Pastry shop without it writes the README\'s pictures', t => {
  withTemporaryDirectory(t, temp => {
    const given = join(temp, 'review', 'bakery');
    assert.equal(outputFolder('bakery', given), given);
    assert.ok(existsSync(given));
    // A folder the person named is theirs: it may already be there.
    assert.equal(outputFolder('default', given), given);
    assert.equal(outputFolder('default'), README_FOLDER);
  });
});
