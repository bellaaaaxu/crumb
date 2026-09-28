import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { openDatabase, SCHEMA_VERSION } from '../server/db.mjs';
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
    assert.deepEqual(versions.map(row => row.version), [SCHEMA_VERSION]);
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
