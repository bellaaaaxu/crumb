/* The operator commands, run the way a person runs them: as separate processes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyPassword } from '../server/passwords.mjs';
import { unknownThemeError } from '../server/themes.mjs';
import { fixture } from './helpers.mjs';

const scripts = fileURLToPath(new URL('../scripts/', import.meta.url));
const run = (script, args, { cwd, env = {}, input } = {}) => spawnSync(process.execPath, [join(scripts, script), ...args], {
  cwd, input, encoding: 'utf8', env: { ...process.env, ...env },
});
const scratch = t => {
  const dir = mkdtempSync(join(tmpdir(), 'crumb-ops-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

test('init-secrets writes a setup code and .env, never prints the code, and never overwrites', t => {
  const cwd = scratch(t);
  const first = run('init-secrets.mjs', [], { cwd });
  assert.equal(first.status, 0, first.stderr);
  const token = readFileSync(join(cwd, '.secrets', 'setup-token'), 'utf8').trim();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(first.stdout.includes(token), false);
  const env = readFileSync(join(cwd, '.env'), 'utf8');
  assert.match(env, /^PUBLIC_ORIGIN=http:\/\/localhost:3000$/m);
  assert.match(env, /^ALLOW_LOCAL_HTTP=true$/m);
  // The folder is closed; the one file in it is readable, so the container can read it whatever the host user id.
  if (process.platform !== 'win32') {
    assert.equal(statSync(join(cwd, '.secrets')).mode & 0o777, 0o700);
    assert.equal(statSync(join(cwd, '.secrets', 'setup-token')).mode & 0o777, 0o644);
  }

  const second = run('init-secrets.mjs', [], { cwd });
  assert.equal(second.status, 0);
  assert.match(second.stdout, /kept/i);
  assert.equal(readFileSync(join(cwd, '.secrets', 'setup-token'), 'utf8').trim(), token);
});

test('the setup code stays readable for the container under a strict umask',
  { skip: process.platform === 'win32' && 'Windows has no umask or POSIX permission bits' }, t => {
    const cwd = scratch(t);
    const strict = spawnSync('sh', ['-c', `umask 077 && "${process.execPath}" "${join(scripts, 'init-secrets.mjs')}"`], { cwd, encoding: 'utf8' });
    assert.equal(strict.status, 0, strict.stderr);
    assert.equal(statSync(join(cwd, '.secrets')).mode & 0o777, 0o700);
    assert.equal(statSync(join(cwd, '.secrets', 'setup-token')).mode & 0o777, 0o644);
  });

test('init-secrets prepares an HTTPS deployment when given its address', t => {
  const cwd = scratch(t);
  const result = run('init-secrets.mjs', ['--origin', 'https://crumb.example.com'], { cwd });
  assert.equal(result.status, 0, result.stderr);
  const env = readFileSync(join(cwd, '.env'), 'utf8');
  assert.match(env, /^PUBLIC_ORIGIN=https:\/\/crumb\.example\.com$/m);
  assert.match(env, /^ALLOW_LOCAL_HTTP=false$/m);
  assert.match(env, /^SITE_ADDRESS=crumb\.example\.com$/m);
  assert.match(env, /^COMPOSE_PATH_SEPARATOR=:$/m);
  assert.match(env, /^COMPOSE_FILE=compose\.yaml:compose\.https\.yaml$/m, 'every compose command includes the HTTPS proxy');
  for (const bad of [['--origin', 'http://crumb.example.com'], ['--origin'], ['--surprise']]) {
    const refused = run('init-secrets.mjs', bad, { cwd: scratch(t) });
    assert.equal(refused.status, 2, bad.join(' '));
  }
});

test('backup and restore commands take explicit paths and refuse to overwrite', async t => {
  const { owner, member, db, dir } = fixture(t);
  db.prepare(`INSERT INTO ledger (id, user_id, delta_units, kind, actor_id, reason, source_id, request_key, created_at)
              VALUES ('00000000-0000-4000-8000-000000000001', ?, 900, 'grant', ?, '', NULL, 'cli-grant-key-00001', ?)`)
    .run(member.id, owner.id, new Date().toISOString());
  const out = join(dir, 'cli-backup.sqlite');
  const backup = run('backup.mjs', ['--output', out], { env: { DATA_DIR: dir } });
  assert.equal(backup.status, 0, backup.stderr);
  assert.match(backup.stdout, /sha256 [0-9a-f]{64}/);
  assert.ok(existsSync(out));
  assert.equal(run('backup.mjs', ['--output', out], { env: { DATA_DIR: dir } }).status, 1, 'existing file');
  assert.equal(run('backup.mjs', [], { env: { DATA_DIR: dir } }).status, 2, 'missing --output');
  assert.equal(run('backup.mjs', ['--output', join(dir, 'b.sqlite'), '--force'], { env: { DATA_DIR: dir } }).status, 2);
  assert.equal(run('backup.mjs', ['--output', join(dir, 'c.sqlite')], { env: { DATA_DIR: join(dir, 'nowhere') } }).status, 1);

  const target = join(dir, 'restored', 'crumb.sqlite');
  const restore = run('restore.mjs', ['--from', out, '--to', target]);
  assert.equal(restore.status, 0, restore.stderr);
  assert.ok(existsSync(target));
  assert.equal(run('restore.mjs', ['--from', out, '--to', target]).status, 1, 'existing target');
  assert.equal(run('restore.mjs', ['--from', out]).status, 2, 'missing --to');
});

test('recover-owner resets an owner password from stdin and signs them out', async t => {
  const { db, owner, member, dir } = fixture(t);
  db.prepare(`INSERT INTO sessions (token_hash, user_id, csrf_hash, created_at, expires_at)
              VALUES ('owner-session', ?, 'x', ?, '2099-01-01T00:00:00.000Z')`).run(owner.id, new Date().toISOString());
  const password = 'the owner is back in business';
  const result = run('recover-owner.mjs', ['--username', 'OWNER'], { env: { DATA_DIR: dir }, input: `${password}\n` });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes(password), false);
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(owner.id);
  assert.equal(await verifyPassword(password, row.password_hash), true);
  assert.equal(db.prepare('SELECT count(*) AS n FROM sessions WHERE user_id = ?').get(owner.id).n, 0);
  const audit = db.prepare(`SELECT actor_id, target_id FROM audit WHERE action = 'owner.recover'`).get();
  assert.deepEqual(audit, { actor_id: null, target_id: owner.id });

  assert.equal(run('recover-owner.mjs', ['--username', 'member'], { env: { DATA_DIR: dir }, input: `${password}\n` }).status, 1, 'not an owner');
  assert.equal(run('recover-owner.mjs', ['--username', 'nobody'], { env: { DATA_DIR: dir }, input: `${password}\n` }).status, 1);
  assert.equal(run('recover-owner.mjs', ['--username', 'owner'], { env: { DATA_DIR: dir }, input: 'short\n' }).status, 1);
  assert.equal(run('recover-owner.mjs', [], { env: { DATA_DIR: dir } }).status, 2);
  assert.equal(run('recover-owner.mjs', ['--username', 'owner', '--password', 'x'], { env: { DATA_DIR: dir } }).status, 2,
    'passwords are never taken as arguments');
  assert.notEqual(db.prepare('SELECT password_hash FROM users WHERE id = ?').get(member.id).password_hash, row.password_hash);
});

test('recover-owner lifts the sign-in lock on that owner, and only on that owner', t => {
  const { db, dir } = fixture(t);
  const lock = db.prepare('INSERT INTO login_limits (bucket, attempts, window_start) VALUES (?, 5, ?)');
  for (const bucket of ['account:owner', 'account:member', 'address:203.0.113.9']) lock.run(bucket, new Date().toISOString());
  const result = run('recover-owner.mjs', ['--username', 'owner'], { env: { DATA_DIR: dir }, input: 'a completely new owner password\n' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /sign-in lock/i);
  assert.deepEqual(db.prepare('SELECT bucket FROM login_limits ORDER BY bucket').all().map(row => row.bucket),
    ['account:member', 'address:203.0.113.9']);
});

test('recover-owner gives a password to an owner who joined as a team member, without one', t => {
  const { db, dir } = fixture(t);
  const promoted = randomUUID();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO users (id, username, display_name, password_hash, role, active, joined_at, created_at)
              VALUES (?, 'was.member', 'Was Member', NULL, 'owner', 1, ?, ?)`).run(promoted, now, now);
  const result = run('recover-owner.mjs', ['--username', 'was.member'], { env: { DATA_DIR: dir }, input: 'a completely new owner password\n' });
  assert.equal(result.status, 0, result.stderr);
  assert.notEqual(db.prepare('SELECT password_hash FROM users WHERE id = ?').get(promoted).password_hash, null);
});

test('recover-owner does not give a password to an owner who never joined', t => {
  const { db, owner, dir } = fixture(t);
  const pendingId = randomUUID();
  db.prepare(`INSERT INTO users (id, username, display_name, password_hash, role, active, created_at)
              VALUES (?, 'second.owner', 'Second Owner', NULL, 'owner', 0, ?)`).run(pendingId, new Date().toISOString());
  const result = run('recover-owner.mjs', ['--username', 'second.owner'], { env: { DATA_DIR: dir }, input: 'a completely new owner password\n' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /has not joined yet/);
  assert.match(result.stderr, /new invitation/);
  assert.equal(db.prepare('SELECT password_hash FROM users WHERE id = ?').get(pendingId).password_hash, null);
  assert.equal(db.prepare(`SELECT count(*) AS n FROM audit WHERE action = 'owner.recover'`).get().n, 0);
  assert.ok(owner.id);
});

// The refusal's wording is pinned once, in tests/themes.test.mjs.
const UNKNOWN_THEME = unknownThemeError('cafe').message;

test('recover-owner refuses a database whose team uses a theme this version does not include', t => {
  const { db, owner, dir } = fixture(t);
  db.prepare(`UPDATE organization SET theme = 'cafe' WHERE id = 1`).run();
  const before = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(owner.id).password_hash;
  const result = run('recover-owner.mjs', ['--username', 'owner'], { env: { DATA_DIR: dir }, input: 'a completely new owner password\n' });
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes(`Error: ${UNKNOWN_THEME}`), `stderr was: ${result.stderr}`);
  assert.equal(db.prepare('SELECT password_hash FROM users WHERE id = ?').get(owner.id).password_hash, before);
  assert.equal(db.prepare(`SELECT count(*) AS n FROM audit WHERE action = 'owner.recover'`).get().n, 0);
});

test('the server will not start on a database whose team uses a theme this version does not include', t => {
  const { db, dir } = fixture(t);
  db.prepare(`UPDATE organization SET theme = 'cafe' WHERE id = 1`).run();
  // It refuses before the port opens; the timeout only matters if it wrongly starts.
  const server = spawnSync(process.execPath, [fileURLToPath(new URL('../server/main.mjs', import.meta.url))], {
    encoding: 'utf8',
    timeout: 15_000,
    env: { ...process.env, PUBLIC_ORIGIN: 'http://127.0.0.1:3999', ALLOW_LOCAL_HTTP: 'true', PORT: '3999', HOST: '127.0.0.1', DATA_DIR: dir },
  });
  assert.equal(server.status, 1, `exit ${server.status} ${server.signal ?? ''}: ${server.stderr}`);
  assert.ok(server.stderr.includes(`Crumb cannot start: ${UNKNOWN_THEME}`), `stderr was: ${server.stderr}`);
});
