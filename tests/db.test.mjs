import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { openDatabase, schemaVersionOf, SCHEMA_VERSION } from '../server/db.mjs';
import { fixture } from './helpers.mjs';

const now = () => new Date().toISOString();

function insertGrant(db, userId, actorId, delta = 500) {
  const id = randomUUID();
  db.prepare(`INSERT INTO ledger (id, user_id, delta_units, kind, actor_id, reason, source_id, request_key, created_at)
              VALUES (?, ?, ?, 'grant', ?, '', NULL, 'test-request-key-01', ?)`).run(id, userId, delta, actorId, now());
  return id;
}

test('connections enforce foreign keys, WAL and a busy timeout', t => {
  const { db, member } = fixture(t);
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
  assert.equal(db.pragma('journal_mode', { simple: true }), 'wal');
  assert.equal(db.pragma('busy_timeout', { simple: true }), 5000);
  assert.throws(() => insertGrant(db, 'no-such-user', member.id), /FOREIGN KEY/);
});

test('running migrations again does not create tables twice', t => {
  const { db, path } = fixture(t);
  db.close();
  const again = openDatabase(path);
  try {
    const versions = again.prepare('SELECT version FROM schema_migrations ORDER BY version').all();
    // Every migration is recorded once, however many times the database is opened.
    assert.deepEqual(versions.map(row => row.version), Array.from({ length: SCHEMA_VERSION }, (_, index) => index + 1));
    const tables = again.prepare(`SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name='users'`).get();
    assert.equal(tables.n, 1);
  } finally {
    again.close();
  }
});

test('ledger, audit and collection rows cannot be rewritten or deleted', t => {
  const { db, owner, member } = fixture(t);
  const grantId = insertGrant(db, member.id, owner.id);
  db.prepare(`INSERT INTO audit (id, actor_id, action, target_id, detail_json, created_at)
              VALUES (?, ?, 'test.action', NULL, '{}', ?)`).run(randomUUID(), owner.id, now());
  db.prepare(`INSERT INTO collection_unlocks (user_id, ordinal, sprite_key, unlocked_at, grant_id)
              VALUES (?, 0, 'tart', ?, ?)`).run(member.id, now(), grantId);

  const statements = [
    'UPDATE ledger SET delta_units = 1',
    'DELETE FROM ledger',
    `UPDATE audit SET action = 'rewritten'`,
    'DELETE FROM audit',
    `UPDATE collection_unlocks SET sprite_key = 'laopo'`,
    'DELETE FROM collection_unlocks',
  ];
  for (const sql of statements) assert.throws(() => db.prepare(sql).run(), /append-only/, sql);
  assert.equal(db.prepare('SELECT delta_units FROM ledger WHERE id = ?').get(grantId).delta_units, 500);
});

test('ledger rows carry the sign of their kind and corrections are unique', t => {
  const { db, owner, member } = fixture(t);
  const insert = (kind, delta, sourceId) => db.prepare(
    `INSERT INTO ledger (id, user_id, delta_units, kind, actor_id, reason, source_id, request_key, created_at)
     VALUES (?, ?, ?, ?, ?, 'r', ?, 'test-request-key-01', ?)`).run(randomUUID(), member.id, delta, kind, owner.id, sourceId, now());
  assert.throws(() => insert('grant', -5, null), /CHECK/);
  assert.throws(() => insert('grant', 0, null), /CHECK/);
  assert.throws(() => insert('grant', 1_000_000_000_001, null), /CHECK/);
  assert.throws(() => insert('revoke', 5, 'x'), /CHECK/);
  assert.throws(() => insert('refund', -5, 'x'), /CHECK/);
  assert.throws(() => insert('revoke', -5, null), /CHECK/);
  const grantId = insertGrant(db, member.id, owner.id, 5);
  insert('revoke', -5, grantId);
  assert.throws(() => insert('revoke', -5, grantId), /UNIQUE/);
});

test('spends, voids and batch ids keep to their own shape', t => {
  const { db, owner, member } = fixture(t);
  const insert = ({ kind, delta, actorId = owner.id, sourceId = null, batchId = null }) => {
    const id = randomUUID();
    db.prepare(`INSERT INTO ledger (id, user_id, delta_units, kind, actor_id, source_id, batch_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, member.id, delta, kind, actorId, sourceId, batchId, now());
    return id;
  };
  // A spend is a member's own negative entry with no row behind it.
  const spendId = insert({ kind: 'spend', delta: -100, actorId: member.id });
  assert.throws(() => insert({ kind: 'spend', delta: -100, actorId: member.id, sourceId: spendId }), /CHECK/);
  // A void gives a spend back, so it is positive and names that spend.
  assert.throws(() => insert({ kind: 'void', delta: -100, sourceId: spendId }), /CHECK/);
  assert.throws(() => insert({ kind: 'void', delta: 100 }), /CHECK/);
  insert({ kind: 'void', delta: 100, sourceId: spendId });
  // Only grants belong to a batch, not even the revoke of a batch grant.
  const grantId = insert({ kind: 'grant', delta: 500, batchId: 'batch-0001' });
  assert.throws(() => insert({ kind: 'revoke', delta: -500, sourceId: grantId, batchId: 'batch-0001' }), /CHECK/);
});

test('a benefit icon key is 2 to 32 characters, or none', t => {
  const { db } = fixture(t);
  const insert = iconKey => db.prepare(`INSERT INTO rewards (id, name, cost_units, icon_key, created_at, updated_at)
                                        VALUES (?, 'Coffee', 450, ?, ?, ?)`).run(randomUUID(), iconKey, now(), now());
  for (const iconKey of [null, 'ab', 'a'.repeat(32)]) insert(iconKey);
  assert.throws(() => insert('a'), /CHECK/);
  assert.throws(() => insert('a'.repeat(33)), /CHECK/);
});

test('the organization is a single row', t => {
  const { db } = fixture(t);
  assert.throws(() => db.prepare(`INSERT INTO organization (id, name, mode, currency, unit_label, threshold_units, locale, created_at)
    VALUES (2, 'Second', 'points', NULL, 'points', 100, 'en', ?)`).run(now()), /CHECK|UNIQUE/);
});

test('closing and reopening keeps users', t => {
  const { db, path, member } = fixture(t);
  db.close();
  const reopened = openDatabase(path);
  try {
    assert.equal(reopened.prepare('SELECT username FROM users WHERE id = ?').get(member.id).username, 'member');
  } finally {
    reopened.close();
  }
});

test('a database from a newer Crumb refuses to start', t => {
  const { db, path } = fixture(t);
  db.close();
  const raw = new Database(path);
  raw.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(SCHEMA_VERSION + 1, now());
  raw.close();
  assert.throws(() => openDatabase(path), error => error.code === 'SCHEMA_TOO_NEW');
});

test('a database that is already up to date opens with a stray reference in it', t => {
  const { db, path, member } = fixture(t);
  db.close();
  const raw = new Database(path);
  raw.pragma('foreign_keys = OFF');
  raw.prepare(`INSERT INTO collection_unlocks (user_id, ordinal, sprite_key, unlocked_at, grant_id)
               VALUES (?, 0, 'tart', ?, ?)`).run(member.id, now(), randomUUID());
  raw.close();
  // Nothing is migrated, so an old stray row must not keep Crumb, or owner recovery, from starting.
  const reopened = openDatabase(path);
  try {
    assert.equal(reopened.pragma('foreign_key_check').length, 1);
  } finally {
    reopened.close();
  }
});

/* A database file in a fresh temporary folder that goes when the test ends. Tests close
 * their own connections first: Windows cannot delete a file SQLite still has open. */
function tempDatabasePath(t) {
  const dir = mkdtempSync(join(tmpdir(), 'crumb-migrate-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, 'crumb.sqlite');
}

/* A schema 1 database like one Crumb 0.1 leaves behind: 001-initial.sql applied and recorded
 * as version 1, holding an organization, an owner, a member, one grant, its revoke and the
 * collection unlock that points at the grant. Tests add whatever else they need. */
function version1Database(path) {
  const raw = new Database(path);
  raw.exec(readFileSync(new URL('../server/migrations/001-initial.sql', import.meta.url), 'utf8'));
  raw.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  raw.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)').run(now());
  raw.prepare(`INSERT INTO organization (id, name, mode, currency, unit_label, threshold_units, locale, created_at)
               VALUES (1, 'Old Team', 'credit', 'CAD', 'Team credit', 5000, 'en', ?)`).run(now());
  const owner = randomUUID();
  const member = randomUUID();
  raw.prepare(`INSERT INTO users (id, username, display_name, password_hash, role, active, joined_at, created_at)
               VALUES (?, 'owner', 'Olive', 'x', 'owner', 1, ?, ?)`).run(owner, now(), now());
  raw.prepare(`INSERT INTO users (id, username, display_name, role, active, joined_at, created_at)
               VALUES (?, 'mina', 'Mina', 'member', 1, ?, ?)`).run(member, now(), now());
  const grantId = randomUUID();
  raw.prepare(`INSERT INTO ledger (id, user_id, delta_units, kind, actor_id, reason, created_at)
               VALUES (?, ?, 5000, 'grant', ?, 'Thanks', ?)`).run(grantId, member, owner, now());
  raw.prepare(`INSERT INTO ledger (id, user_id, delta_units, kind, actor_id, source_id, created_at)
               VALUES (?, ?, -5000, 'revoke', ?, ?, ?)`).run(randomUUID(), member, owner, grantId, now());
  raw.prepare(`INSERT INTO collection_unlocks (user_id, ordinal, sprite_key, unlocked_at, grant_id)
               VALUES (?, 0, 'laopo', ?, ?)`).run(member, now(), grantId);
  raw.close();
  return { owner, member, grantId };
}

const ledgerRows = db => db.prepare('SELECT rowid, * FROM ledger ORDER BY rowid').all();

/* The rebuilt ledger holds the same rows under the same rowids; the new batch_id is empty on every one. */
function assertLedgerCarried(db, before) {
  const after = ledgerRows(db);
  assert.deepEqual(after.map(row => row.batch_id), before.map(() => null));
  assert.deepEqual(after.map(({ batch_id: _batchId, ...row }) => row), before);
}

test('migration 002 carries a version 1 database across intact', t => {
  const path = tempDatabasePath(t);
  const { member, grantId } = version1Database(path);
  const raw = new Database(path);
  const before = ledgerRows(raw);
  raw.close();

  const db = openDatabase(path);
  try {
    assert.equal(schemaVersionOf(db), SCHEMA_VERSION);
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
    assert.deepEqual(db.prepare('SELECT count(*) AS n, COALESCE(SUM(delta_units), 0) AS sum FROM ledger').get(), { n: 2, sum: 0 });
    assertLedgerCarried(db, before);
    assert.equal(db.prepare('SELECT grant_id FROM collection_unlocks WHERE user_id = ?').get(member).grant_id, grantId);
    assert.equal(db.prepare('SELECT spending FROM organization').get().spending, 'self');
    // 0.1 goes straight to the latest schema: 003 runs in the same update, and the team is on the default theme.
    assert.equal(db.prepare('SELECT theme FROM organization').get().theme, 'default');
    const names = db.prepare(`SELECT name FROM sqlite_master WHERE tbl_name = 'ledger' AND type IN ('index', 'trigger') AND name NOT LIKE 'sqlite_autoindex_%' ORDER BY name`).all().map(row => row.name);
    assert.deepEqual(names, ['ledger_by_batch', 'ledger_by_time', 'ledger_by_user', 'ledger_no_delete', 'ledger_no_update', 'ledger_one_correction']);
    // The widened constraint accepts the new kinds and still refuses the wrong sign.
    db.prepare(`INSERT INTO ledger (id, user_id, delta_units, kind, actor_id, created_at) VALUES (?, ?, -100, 'spend', ?, ?)`).run(randomUUID(), member, member, now());
    assert.throws(() => db.prepare(`INSERT INTO ledger (id, user_id, delta_units, kind, actor_id, created_at) VALUES (?, ?, 100, 'spend', ?, ?)`).run(randomUUID(), member, member, now()), /CHECK/);
    assert.throws(() => db.prepare('UPDATE ledger SET reason = ?').run('x'), /append-only/);
  } finally {
    db.close();
  }
});

test('a version 1 database with benefits comes up in confirmed mode', t => {
  const path = tempDatabasePath(t);
  const { owner, member } = version1Database(path);
  // A benefit that was confirmed and then refunded: redeem and refund are the kinds whose
  // sign and source rules 002 rewrites, so they must come across too.
  const raw = new Database(path);
  const rewardId = randomUUID();
  const redemptionId = randomUUID();
  raw.prepare(`INSERT INTO rewards (id, name, description, cost_units, active, created_at, updated_at) VALUES (?, 'Coffee', '', 450, 1, ?, ?)`).run(rewardId, now(), now());
  raw.prepare(`INSERT INTO ledger (id, user_id, delta_units, kind, actor_id, reason, created_at)
               VALUES (?, ?, 1000, 'grant', ?, 'Covered a shift', ?)`).run(randomUUID(), member, owner, now());
  raw.prepare(`INSERT INTO redemptions (id, user_id, reward_id, reward_name, cost_units, status, created_at, resolved_at, resolved_by)
               VALUES (?, ?, ?, 'Coffee', 450, 'completed', ?, ?, ?)`).run(redemptionId, member, rewardId, now(), now(), owner);
  raw.prepare(`INSERT INTO ledger (id, user_id, delta_units, kind, actor_id, source_id, created_at)
               VALUES (?, ?, -450, 'redeem', ?, ?, ?)`).run(randomUUID(), member, owner, redemptionId, now());
  raw.prepare(`INSERT INTO ledger (id, user_id, delta_units, kind, actor_id, reason, source_id, created_at)
               VALUES (?, ?, 450, 'refund', ?, 'Confirmed by mistake', ?, ?)`).run(randomUUID(), member, owner, redemptionId, now());
  const before = ledgerRows(raw);
  raw.close();
  assert.deepEqual(before.map(row => row.kind), ['grant', 'revoke', 'grant', 'redeem', 'refund']);

  const db = openDatabase(path);
  try {
    assert.equal(db.prepare('SELECT spending FROM organization').get().spending, 'confirm');
    assert.equal(db.prepare('SELECT icon_key FROM rewards').get().icon_key, null);
    assertLedgerCarried(db, before);
  } finally {
    db.close();
  }
});

test('an update that would leave a reference to a missing row changes nothing', t => {
  const path = tempDatabasePath(t);
  const { member } = version1Database(path);
  const raw = new Database(path);
  // An unlock whose grant is not in the ledger; SQLite only lets it in with foreign keys off.
  raw.pragma('foreign_keys = OFF');
  const stray = raw.prepare(`INSERT INTO collection_unlocks (user_id, ordinal, sprite_key, unlocked_at, grant_id)
                             VALUES (?, 1, 'tart', ?, ?)`).run(member, now(), randomUUID());
  const before = ledgerRows(raw);
  raw.close();

  assert.throws(() => openDatabase(path), {
    message: `Updating the database to schema ${SCHEMA_VERSION} was stopped and nothing was changed: ` +
      `1 reference(s) point at missing rows (first: collection_unlocks row ${stray.lastInsertRowid} -> ledger).`,
  });
  const after = new Database(path);
  try {
    // Still the version 1 database, down to the ledger it would have rebuilt.
    assert.equal(schemaVersionOf(after), 1);
    assert.equal(after.prepare(`SELECT count(*) AS n FROM sqlite_master WHERE name = 'ledger_v2'`).get().n, 0);
    assert.equal(after.prepare(`SELECT count(*) AS n FROM pragma_table_info('organization') WHERE name = 'spending'`).get().n, 0);
    // 002 and 003 run in one transaction, so 003's column went back with everything else.
    assert.equal(after.prepare(`SELECT count(*) AS n FROM pragma_table_info('organization') WHERE name = 'theme'`).get().n, 0);
    assert.doesNotMatch(after.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'ledger'`).get().sql, /spend/);
    assert.deepEqual(ledgerRows(after), before);
    const triggers = after.prepare(`SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'ledger' ORDER BY name`).all();
    assert.deepEqual(triggers.map(row => row.name), ['ledger_no_delete', 'ledger_no_update']);
  } finally {
    after.close();
  }
});

/* A schema 2 database like one Crumb 0.2 leaves behind: the version 1 database above with
 * 002-spending.sql applied the way server/db.mjs applies it (foreign keys off) and recorded
 * as version 2, plus a benefit with an icon, so a column 002 added carries data too. */
function version2Database(path) {
  const ids = version1Database(path);
  const raw = new Database(path);
  raw.pragma('foreign_keys = OFF');
  raw.exec(readFileSync(new URL('../server/migrations/002-spending.sql', import.meta.url), 'utf8'));
  raw.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (2, ?)').run(now());
  raw.prepare(`INSERT INTO rewards (id, name, description, cost_units, active, icon_key, created_at, updated_at)
               VALUES (?, 'Coffee', '', 450, 1, 'tart', ?, ?)`).run(randomUUID(), now(), now());
  raw.close();
  return ids;
}

/* Every row a team owns, in a fixed order, for before-and-after comparisons. */
const teamRows = db => ({
  organization: db.prepare('SELECT * FROM organization').all(),
  users: db.prepare('SELECT * FROM users ORDER BY id').all(),
  ledger: ledgerRows(db),
  rewards: db.prepare('SELECT * FROM rewards ORDER BY id').all(),
  unlocks: db.prepare('SELECT * FROM collection_unlocks ORDER BY user_id, ordinal').all(),
});

test('migration 003 puts a 0.2 team on the default theme and leaves its data as it was', t => {
  const path = tempDatabasePath(t);
  version2Database(path);
  const raw = new Database(path);
  const before = teamRows(raw);
  raw.close();

  const db = openDatabase(path);
  try {
    assert.equal(schemaVersionOf(db), SCHEMA_VERSION);
    assert.deepEqual(db.pragma('foreign_key_check'), []);
    const after = teamRows(db);
    assert.deepEqual(after.organization.map(row => row.theme), ['default']);
    assert.deepEqual(after.organization.map(({ theme: _theme, ...row }) => row), before.organization);
    assert.deepEqual({ ...after, organization: [] }, { ...before, organization: [] });
  } finally {
    db.close();
  }
});

test('a team theme is 2 to 32 characters; which themes exist is up to the theme list files', t => {
  const { db } = fixture(t);
  assert.equal(db.prepare('SELECT theme FROM organization').get().theme, 'default', 'a team set up without one is on the default');
  const set = theme => db.prepare('UPDATE organization SET theme = ? WHERE id = 1').run(theme);
  // Any well-formed id is stored, shipped or not: openDatabase and restoreDatabase refuse an unknown one.
  for (const theme of ['ab', 'a'.repeat(32), 'cafe']) set(theme);
  assert.throws(() => set('a'), /CHECK/);
  assert.throws(() => set('a'.repeat(33)), /CHECK/);
  assert.throws(() => set(null), /NOT NULL/);
});
