import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { openDatabase, SCHEMA_VERSION } from '../server/db.mjs';
import { backupDatabase, restoreDatabase } from '../server/backup.mjs';
import { balanceOf, grant } from '../server/ledger.mjs';
import { saveReward } from '../server/rewards.mjs';
import { requestRedemption, resolveRedemption } from '../server/redemptions.mjs';
import { inviteMember, issueReset } from '../server/members.mjs';
import { setLogo } from '../server/org.mjs';
import { fixture } from './helpers.mjs';

const code = expected => error => {
  assert.equal(error.code, expected);
  return true;
};
const count = (db, sql) => db.prepare(sql).get().n;

test('restore preserves business data and invalidates credentials', async t => {
  const {db,owner,member,path} = fixture(t);
  grant(db,owner,{userId:member.id,units:5000,reason:'Thank you',key:'backup-grant-0001'});
  db.prepare('INSERT INTO sessions(token_hash,user_id,csrf_hash,expires_at) VALUES(?,?,?,?)')
    .run('test-session',member.id,'test-csrf','2099-01-01T00:00:00.000Z');
  await backupDatabase(db,path+'.backup');
  await restoreDatabase({sourcePath:path+'.backup',destinationPath:path+'.restored'});
  const restored=openDatabase(path+'.restored');
  try {
    assert.equal(balanceOf(restored,member.id).postedUnits,5000);
    assert.equal(restored.prepare('SELECT count(*) AS n FROM sessions').get().n,0);
    assert.equal(restored.prepare('SELECT count(*) AS n FROM collection_unlocks').get().n,1);
  } finally { restored.close(); }
});

test('everything a business needs survives: people, ledger, requests, collections, logo', async t => {
  const { db, owner, member, member2, dir } = fixture(t);
  grant(db, owner, { userId: member.id, units: 7500, reason: 'Great month', key: 'full-backup-grant-1' });
  const reward = saveReward(db, owner, { name: 'Coffee', description: '', costUnits: 1250, active: true });
  const done = requestRedemption(db, member, { rewardId: reward.id, key: 'full-backup-request1' });
  resolveRedemption(db, owner, { redemptionId: done.redemption.id, action: 'complete', key: 'full-backup-complete' });
  requestRedemption(db, member, { rewardId: reward.id, key: 'full-backup-request2' });
  const logo = Buffer.from('a re-encoded png would be here');
  setLogo(db, owner, logo);
  const invite = inviteMember(db, owner, { username: 'not.yet', displayName: 'Not Yet', role: 'member' });
  issueReset(db, owner, member2.id);

  const result = await backupDatabase(db, join(dir, 'nightly.sqlite'));
  assert.equal(result.schemaVersion, SCHEMA_VERSION);
  assert.equal(result.sha256, createHash('sha256').update(readFileSync(result.path)).digest('hex'));
  await restoreDatabase({ sourcePath: result.path, destinationPath: join(dir, 'restored', 'crumb.sqlite') });
  const restored = openDatabase(join(dir, 'restored', 'crumb.sqlite'));
  try {
    const tables = ['users', 'ledger', 'redemptions', 'rewards', 'collection_unlocks', 'idempotency', 'audit'];
    for (const table of tables) assert.equal(count(restored, `SELECT count(*) AS n FROM ${table}`), count(db, `SELECT count(*) AS n FROM ${table}`), table);
    assert.deepEqual(balanceOf(restored, member.id), balanceOf(db, member.id));
    assert.deepEqual(restored.prepare('SELECT logo_png FROM organization').get().logo_png, logo);
    assert.equal(count(restored, 'SELECT count(*) AS n FROM tokens'), 0, 'invitation and reset links must be issued again');
    assert.equal(restored.prepare('SELECT active FROM users WHERE id = ?').get(invite.user.id).active, 0);
  } finally {
    restored.close();
  }
});

test('the backup includes changes still in the WAL and nothing written after it', async t => {
  const { db, owner, member, dir } = fixture(t);
  db.pragma('wal_autocheckpoint = 0');
  grant(db, owner, { userId: member.id, units: 1000, reason: 'Before', key: 'wal-before-backup-1' });
  const result = await backupDatabase(db, join(dir, 'wal.sqlite'));
  grant(db, owner, { userId: member.id, units: 2000, reason: 'After', key: 'wal-after-backup-01' });
  const snapshot = new Database(result.path, { readonly: true });
  try {
    assert.equal(snapshot.prepare('SELECT SUM(delta_units) AS total FROM ledger').get().total, 1000);
    assert.equal(snapshot.pragma('journal_mode', { simple: true }), 'delete');
  } finally {
    snapshot.close();
  }
  assert.deepEqual(readdirSync(dir).filter(name => name.startsWith('wal.sqlite')), ['wal.sqlite'], 'one self-contained file');
});

test('another connection writing during a backup never leaves half a change in it', async t => {
  const { db, owner, member, path, dir } = fixture(t, { mode: 'points', thresholdUnits: 100 });
  for (let i = 0; i < 30; i += 1) grant(db, owner, { userId: member.id, units: 100, reason: `Warm-up ${i}`, key: `warm-up-grant-${String(i).padStart(4, '0')}` });
  const other = openDatabase(path);
  let writes = 0;
  let result;
  try {
    const writer = (async () => {
      while (writes < 25) {
        grant(other, owner, { userId: member.id, units: 100, reason: 'During the backup', key: `during-backup-${String(writes).padStart(5, '0')}` });
        writes += 1;
        await new Promise(resolve => setImmediate(resolve));
      }
    })();
    result = await backupDatabase(db, join(dir, 'busy.sqlite'), { pagesPerStep: 1 });
    await writer;
  } finally {
    other.close();
  }
  const snapshot = new Database(result.path, { readonly: true });
  try {
    assert.equal(snapshot.pragma('integrity_check', { simple: true }), 'ok');
    const grants = snapshot.prepare(`SELECT count(*) AS n, SUM(delta_units) AS total FROM ledger WHERE kind = 'grant'`).get();
    assert.ok(grants.n >= 30 && grants.n <= 55);
    assert.equal(grants.total, grants.n * 100);
    // Each grant is one transaction: its audit row, its stored response and its unlock travel with it.
    assert.equal(snapshot.prepare(`SELECT count(*) AS n FROM audit WHERE action = 'grant.create'`).get().n, grants.n);
    assert.equal(snapshot.prepare('SELECT count(*) AS n FROM idempotency').get().n, grants.n);
    assert.equal(snapshot.prepare('SELECT count(*) AS n FROM collection_unlocks').get().n, Math.min(39, grants.n));
  } finally {
    snapshot.close();
  }
});

test('backups never overwrite a file', async t => {
  const { db, dir } = fixture(t);
  writeFileSync(join(dir, 'taken.sqlite'), 'keep me');
  await assert.rejects(backupDatabase(db, join(dir, 'taken.sqlite')), code('TARGET_EXISTS'));
  assert.equal(readFileSync(join(dir, 'taken.sqlite'), 'utf8'), 'keep me');
});

test('restore refuses an existing target, the live file, corrupt files and newer schemas', async t => {
  const { db, path, dir } = fixture(t);
  const good = (await backupDatabase(db, join(dir, 'good.sqlite'))).path;
  writeFileSync(join(dir, 'occupied.sqlite'), 'already here');
  await assert.rejects(restoreDatabase({ sourcePath: good, destinationPath: join(dir, 'occupied.sqlite') }), code('TARGET_EXISTS'));
  assert.equal(readFileSync(join(dir, 'occupied.sqlite'), 'utf8'), 'already here');
  await assert.rejects(restoreDatabase({ sourcePath: good, destinationPath: good }), code('SAME_FILE'));
  await assert.rejects(restoreDatabase({ sourcePath: join(dir, 'missing.sqlite'), destinationPath: join(dir, 'x.sqlite') }), code('SOURCE_MISSING'));

  writeFileSync(join(dir, 'garbage.sqlite'), Buffer.alloc(8192, 7));
  await assert.rejects(restoreDatabase({ sourcePath: join(dir, 'garbage.sqlite'), destinationPath: join(dir, 'from-garbage.sqlite') }), code('INVALID_BACKUP'));
  const truncated = readFileSync(good).subarray(0, 3000);
  writeFileSync(join(dir, 'truncated.sqlite'), truncated);
  await assert.rejects(restoreDatabase({ sourcePath: join(dir, 'truncated.sqlite'), destinationPath: join(dir, 'from-truncated.sqlite') }), code('INVALID_BACKUP'));

  const plain = new Database(join(dir, 'not-crumb.sqlite'));
  plain.exec('CREATE TABLE notes (body TEXT)');
  plain.close();
  await assert.rejects(restoreDatabase({ sourcePath: join(dir, 'not-crumb.sqlite'), destinationPath: join(dir, 'from-other.sqlite') }), code('INVALID_BACKUP'));

  const newer = (await backupDatabase(db, join(dir, 'newer.sqlite'))).path;
  const raw = new Database(newer);
  raw.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(SCHEMA_VERSION + 1, new Date().toISOString());
  raw.close();
  await assert.rejects(restoreDatabase({ sourcePath: newer, destinationPath: join(dir, 'from-newer.sqlite') }), code('SCHEMA_TOO_NEW'));

  for (const name of ['from-garbage.sqlite', 'from-truncated.sqlite', 'from-other.sqlite', 'from-newer.sqlite', 'x.sqlite'])
    assert.equal(existsSync(join(dir, name)), false, name);
  assert.deepEqual(readdirSync(dir).filter(name => name.includes('restoring')), [], 'no temporary files left behind');
  assert.ok(existsSync(path));
});
