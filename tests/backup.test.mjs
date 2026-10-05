import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import { openDatabase, schemaVersionOf, SCHEMA_VERSION } from '../server/db.mjs';
import { backupDatabase, restoreDatabase } from '../server/backup.mjs';
import { balanceOf, grant } from '../server/ledger.mjs';
import { saveReward } from '../server/rewards.mjs';
import { requestRedemption, resolveRedemption } from '../server/redemptions.mjs';
import { inviteMember, issueSignInLink } from '../server/members.mjs';
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
  const { db, owner, member, member2, dir } = fixture(t, { spending: 'confirm' });
  grant(db, owner, { userId: member.id, units: 7500, reason: 'Great month', key: 'full-backup-grant-1' });
  const reward = saveReward(db, owner, { name: 'Coffee', description: '', costUnits: 1250, active: true });
  const done = requestRedemption(db, member, { rewardId: reward.id, key: 'full-backup-request1' });
  resolveRedemption(db, owner, { redemptionId: done.redemption.id, action: 'complete', key: 'full-backup-complete' });
  requestRedemption(db, member, { rewardId: reward.id, key: 'full-backup-request2' });
  const logo = Buffer.from('a re-encoded png would be here');
  setLogo(db, owner, logo);
  const invite = inviteMember(db, owner, { username: 'not.yet', displayName: 'Not Yet', role: 'member' });
  issueSignInLink(db, owner, member2.id);

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

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/* The next release, as far as backups care: this code with one more
 * migration. It lives under node_modules/.cache so it still finds the
 * project's dependencies, and is removed afterwards. db.mjs and backup.mjs
 * import server/themes.mjs, which reads ../themes/, so the theme lists come too. */
async function newerCrumb(t) {
  const base = join(ROOT, 'node_modules', '.cache', `crumb-newer-${randomUUID()}`);
  t.after(() => rmSync(base, { recursive: true, force: true }));
  mkdirSync(join(base, 'server', 'migrations'), { recursive: true });
  for (const file of ['backup.mjs', 'db.mjs', 'errors.mjs', 'themes.mjs']) copyFileSync(join(ROOT, 'server', file), join(base, 'server', file));
  for (const file of readdirSync(join(ROOT, 'server', 'migrations')))
    copyFileSync(join(ROOT, 'server', 'migrations', file), join(base, 'server', 'migrations', file));
  cpSync(join(ROOT, 'themes'), join(base, 'themes'), { recursive: true });
  const next = String(SCHEMA_VERSION + 1).padStart(3, '0');
  writeFileSync(join(base, 'server', 'migrations', `${next}-add-stock.sql`), 'ALTER TABLE rewards ADD COLUMN stock INTEGER;\n');
  return import(pathToFileURL(join(base, 'server', 'backup.mjs')).href);
}

test('a restore keeps the schema the backup has, so rolling back to the previous version works', async t => {
  const { db, owner, member, dir } = fixture(t);
  grant(db, owner, { userId: member.id, units: 500, reason: 'Before the upgrade', key: 'before-upgrade-grant' });
  const backup = (await backupDatabase(db, join(dir, 'before-upgrade.sqlite'))).path;
  const newer = await newerCrumb(t);
  const destination = join(dir, 'rolled-back', 'crumb.sqlite');
  // The rollback runbook restores with whichever image is at hand — possibly the newer one.
  const result = await newer.restoreDatabase({ sourcePath: backup, destinationPath: destination });
  const reopened = openDatabase(destination);
  try {
    assert.equal(schemaVersionOf(reopened), SCHEMA_VERSION);
    assert.equal(balanceOf(reopened, member.id).postedUnits, 500);
  } finally {
    reopened.close();
  }
  assert.deepEqual(result, { path: destination, schemaVersion: SCHEMA_VERSION });
});

test('restore checks every index and every reference, not only the page structure', async t => {
  const { db, owner, member, dir } = fixture(t);
  grant(db, owner, { userId: member.id, units: 500, reason: 'Thanks', key: 'integrity-grant-001' });

  // An index that no longer matches its table: quick_check says "ok", integrity_check does not.
  const mismatched = (await backupDatabase(db, join(dir, 'mismatched.sqlite'))).path;
  const raw = new Database(mismatched);
  raw.unsafeMode(true);
  raw.pragma('writable_schema = ON');
  raw.prepare(`UPDATE sqlite_master SET sql = 'CREATE INDEX ledger_by_user ON ledger (created_at, user_id, id)'
               WHERE name = 'ledger_by_user'`).run();
  raw.close();
  const probe = new Database(mismatched, { readonly: true });
  assert.equal(probe.pragma('quick_check', { simple: true }), 'ok', 'the damage is invisible to quick_check');
  probe.close();
  await assert.rejects(restoreDatabase({ sourcePath: mismatched, destinationPath: join(dir, 'from-mismatched.sqlite') }),
    code('INVALID_BACKUP'));

  // A ledger row that belongs to nobody.
  const orphaned = (await backupDatabase(db, join(dir, 'orphaned.sqlite'))).path;
  const loose = new Database(orphaned);
  loose.pragma('foreign_keys = OFF');
  loose.prepare(`INSERT INTO ledger (id, user_id, delta_units, kind, actor_id, created_at)
                 VALUES (?, ?, 100, 'grant', ?, ?)`).run(randomUUID(), randomUUID(), owner.id, new Date().toISOString());
  loose.close();
  await assert.rejects(restoreDatabase({ sourcePath: orphaned, destinationPath: join(dir, 'from-orphaned.sqlite') }),
    code('INVALID_BACKUP'));
  assert.equal(existsSync(join(dir, 'from-mismatched.sqlite')) || existsSync(join(dir, 'from-orphaned.sqlite')), false);
});

test('restore refuses a copy whose latest changes still sit in a file beside it', async t => {
  const { db, owner, member, path, dir } = fixture(t);
  db.pragma('wal_autocheckpoint = 0');
  grant(db, owner, { userId: member.id, units: 5000, reason: 'Only in the WAL so far', key: 'wal-only-grant-0001' });
  assert.ok(statSync(`${path}-wal`).size > 0);
  // Copying only the main file of a running (or killed) Crumb would silently lose this grant.
  await assert.rejects(restoreDatabase({ sourcePath: path, destinationPath: join(dir, 'from-live.sqlite') }), code('SOURCE_IN_USE'));

  const good = (await backupDatabase(db, join(dir, 'good.sqlite'))).path;
  writeFileSync(`${good}-journal`, 'an interrupted transaction');
  await assert.rejects(restoreDatabase({ sourcePath: good, destinationPath: join(dir, 'from-crashed.sqlite') }), code('SOURCE_IN_USE'));
  rmSync(`${good}-journal`);

  // A -wal left behind by an earlier database would be replayed into the restored one.
  writeFileSync(join(dir, 'reused.sqlite-wal'), 'left over from a deleted database');
  await assert.rejects(restoreDatabase({ sourcePath: good, destinationPath: join(dir, 'reused.sqlite') }), code('TARGET_EXISTS'));
  assert.equal(existsSync(join(dir, 'reused.sqlite')), false);
  for (const name of ['from-live.sqlite', 'from-crashed.sqlite']) assert.equal(existsSync(join(dir, name)), false, name);
});

test('backups, restored copies and new databases can be read by their owner only',
  { skip: process.platform === 'win32' && 'Windows has no POSIX permission bits' }, async t => {
    const { db, path, dir } = fixture(t);
    const modeOf = file => statSync(file).mode & 0o777;
    assert.equal(modeOf(path), 0o600, 'the live database holds password hashes');
    const backup = (await backupDatabase(db, join(dir, 'private.sqlite'))).path;
    assert.equal(modeOf(backup), 0o600);
    await restoreDatabase({ sourcePath: backup, destinationPath: join(dir, 'restored', 'crumb.sqlite') });
    assert.equal(modeOf(join(dir, 'restored', 'crumb.sqlite')), 0o600);
  });

const UNKNOWN_THEME = 'This database uses the collection theme "cafe", which this version of Crumb does not include. ' +
  'Run a newer Crumb, or restore a backup made by this version.';

test('restore refuses a backup whose team uses a theme this version does not include', async t => {
  const { db, dir } = fixture(t);
  const backup = (await backupDatabase(db, join(dir, 'cafe.sqlite'))).path;
  const raw = new Database(backup);
  raw.prepare(`UPDATE organization SET theme = 'cafe' WHERE id = 1`).run();
  raw.close();
  const destination = join(dir, 'from-cafe', 'crumb.sqlite');
  await assert.rejects(restoreDatabase({ sourcePath: backup, destinationPath: destination }),
    { code: 'THEME_UNKNOWN', message: UNKNOWN_THEME });
  assert.deepEqual(readdirSync(join(dir, 'from-cafe')), [], 'neither the target nor a temporary copy is left behind');
});

/* A backup made by an earlier release: migrations 001 up to `version` applied the way
 * server/db.mjs applies them (foreign keys off) and recorded, then a team and its owner.
 * Closed cleanly, so no -wal or -journal sits beside it. */
function olderBackup(path, version) {
  const raw = new Database(path);
  raw.pragma('foreign_keys = OFF');
  raw.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const at = new Date().toISOString();
  ['001-initial.sql', '002-spending.sql'].slice(0, version).forEach((file, index) => {
    raw.exec(readFileSync(new URL(`../server/migrations/${file}`, import.meta.url), 'utf8'));
    raw.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(index + 1, at);
  });
  raw.prepare(`INSERT INTO organization (id, name, mode, currency, unit_label, threshold_units, locale, created_at)
               VALUES (1, 'Old Team', 'credit', 'CAD', 'Team credit', 5000, 'en', ?)`).run(at);
  raw.prepare(`INSERT INTO users (id, username, display_name, password_hash, role, active, joined_at, created_at)
               VALUES (?, 'owner', 'Olive', 'x', 'owner', 1, ?, ?)`).run(randomUUID(), at, at);
  raw.close();
  return path;
}

test('backups from before schema 3, and from before setup, restore as usual', async t => {
  const { dir } = fixture(t);
  for (const version of [1, 2]) {
    const destination = join(dir, `from-schema-${version}`, 'crumb.sqlite');
    const source = olderBackup(join(dir, `schema-${version}.sqlite`), version);
    assert.deepEqual(await restoreDatabase({ sourcePath: source, destinationPath: destination }),
      { path: destination, schemaVersion: version });
    // The restored copy keeps its schema; Crumb brings it up to date, onto the default theme.
    const upgraded = openDatabase(destination);
    try {
      assert.equal(schemaVersionOf(upgraded), SCHEMA_VERSION);
      assert.deepEqual(upgraded.prepare('SELECT name, theme FROM organization').get(), { name: 'Old Team', theme: 'default' });
    } finally {
      upgraded.close();
    }
  }

  const notSetUp = openDatabase(join(dir, 'not-set-up.sqlite'));
  let beforeSetup;
  try {
    beforeSetup = (await backupDatabase(notSetUp, join(dir, 'before-setup.sqlite'))).path;
  } finally {
    notSetUp.close();
  }
  const destination = join(dir, 'from-before-setup', 'crumb.sqlite');
  assert.deepEqual(await restoreDatabase({ sourcePath: beforeSetup, destinationPath: destination }),
    { path: destination, schemaVersion: SCHEMA_VERSION });
});
