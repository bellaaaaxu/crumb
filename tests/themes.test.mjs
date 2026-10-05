/* server/themes.mjs: the theme list files the server reads, and each team's theme. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { openDatabase } from '../server/db.mjs';
import { AppError } from '../server/errors.mjs';
import {
  DEFAULT_THEME, THEME_IDS, THEMES, checkDatabaseTheme, orgTheme, orgThemeId, themeById, unknownThemeError,
} from '../server/themes.mjs';
import { fixture } from './helpers.mjs';

const UNKNOWN_THEME = 'This database uses the collection theme "cafe", which this version of Crumb does not include. ' +
  'Run a newer Crumb, or restore a backup made by this version.';
const themesDir = new URL('../themes/', import.meta.url);

test('the server reads every theme list file in themes/, the default theme first', () => {
  const files = readdirSync(themesDir).filter(name => name.endsWith('.json')).sort();
  assert.deepEqual([...THEME_IDS].sort(), files.map(name => name.slice(0, -'.json'.length)));
  assert.equal(DEFAULT_THEME, 'default');
  assert.equal(THEME_IDS[0], DEFAULT_THEME);
  assert.ok(THEME_IDS.includes('bakery'), 'Bakery ships');
  assert.deepEqual([...THEMES.keys()], THEME_IDS);
  for (const id of THEME_IDS) {
    // What the server loads is the committed file, as it is (spec §9).
    const committed = JSON.parse(readFileSync(new URL(`${id}.json`, themesDir), 'utf8'));
    assert.deepEqual(THEMES.get(id), committed, `themes/${id}.json`);
    assert.equal(committed.themeId, id, `themes/${id}.json names its own theme`);
    // organization.theme takes 2 to 32 characters (migration 003), so every shipped id must fit.
    assert.ok(id.length >= 2 && id.length <= 32, id);
  }
  assert.equal(THEMES.get('default').mascot, 'laopo');
  assert.equal(THEMES.get('bakery').mascot, 'toastbite');
});

test('only the shipped themes are known', () => {
  assert.equal(themeById('default'), THEMES.get('default'));
  assert.equal(themeById('bakery'), THEMES.get('bakery'));
  for (const id of ['cafe', 'Default', '', undefined, null, '__proto__', 'constructor', 'toString'])
    assert.equal(themeById(id), undefined, String(id));
});

test('before setup there is no team, and the default theme applies', t => {
  const dir = mkdtempSync(join(tmpdir(), 'crumb-themes-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const db = openDatabase(join(dir, 'crumb.sqlite'));
  try {
    assert.equal(orgThemeId(db), DEFAULT_THEME);
    assert.equal(orgTheme(db), THEMES.get(DEFAULT_THEME));
    checkDatabaseTheme(db);
  } finally {
    db.close();
  }
});

test('a team is on the theme it chose', t => {
  const { db } = fixture(t);
  assert.equal(orgThemeId(db), DEFAULT_THEME, 'a team set up without a theme is on the default');
  db.prepare(`UPDATE organization SET theme = 'bakery' WHERE id = 1`).run();
  assert.equal(orgThemeId(db), 'bakery');
  assert.equal(orgTheme(db), THEMES.get('bakery'));
  checkDatabaseTheme(db);
});

test('a theme this version does not ship is refused, never swapped for the default', t => {
  const { db } = fixture(t);
  db.prepare(`UPDATE organization SET theme = 'cafe' WHERE id = 1`).run();
  assert.equal(orgThemeId(db), 'cafe');
  assert.throws(() => orgTheme(db), { name: 'AppError', status: 500, code: 'THEME_UNKNOWN', message: UNKNOWN_THEME });
  assert.throws(() => checkDatabaseTheme(db), { code: 'THEME_UNKNOWN', message: UNKNOWN_THEME });
  const error = unknownThemeError('cafe');
  assert.ok(error instanceof AppError);
  assert.deepEqual({ status: error.status, code: error.code, message: error.message },
    { status: 500, code: 'THEME_UNKNOWN', message: UNKNOWN_THEME });
});

test('the check passes a database from before schema 3, which has no theme column', () => {
  const raw = new Database(':memory:');
  try {
    checkDatabaseTheme(raw); // not even an organization table yet
    raw.pragma('foreign_keys = OFF'); // 002 rebuilds the ledger; server/db.mjs runs it the same way
    for (const file of ['001-initial.sql', '002-spending.sql'])
      raw.exec(readFileSync(new URL(`../server/migrations/${file}`, import.meta.url), 'utf8'));
    raw.prepare(`INSERT INTO organization (id, name, mode, currency, unit_label, threshold_units, locale, created_at)
                 VALUES (1, 'Old Team', 'points', NULL, 'points', 100, 'en', ?)`).run(new Date().toISOString());
    checkDatabaseTheme(raw);
  } finally {
    raw.close();
  }
});
