/* The deployment and recovery drill without Docker: real `node server/main.mjs`
 * processes, the real operator commands, throwaway folders.
 *
 *   node scripts/ci/process-drill.mjs
 *
 * Start, one-time setup through the API, a retried reward, restart, backup
 * while running, restore into a new data folder and switch to it, owner
 * recovery, and rollback to the original folder. The container version of
 * this drill is scripts/ci/container-drill.sh. */
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const work = mkdtempSync(join(tmpdir(), 'crumb-drill-'));
const PASSWORD = 'drill-owner-password-1';
const NEW_PASSWORD = 'drill-owner-password-2';
const tokenFile = join(work, 'setup-token');
const setupToken = randomBytes(32).toString('base64url');
writeFileSync(tokenFile, `${setupToken}\n`);

const freePort = () => new Promise(resolve => {
  const probe = createServer().listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

function check(ok, what) {
  if (!ok) throw new Error(`DRILL FAILED: ${what}`);
  console.log(`  ok  ${what}`);
}

async function startCrumb(dataDir) {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [join(root, 'server', 'main.mjs')], {
    env: { ...process.env, PUBLIC_ORIGIN: origin, ALLOW_LOCAL_HTTP: 'true', PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir, SETUP_TOKEN_FILE: tokenFile },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`${origin}/healthz`)).ok) return { origin, child, output: () => output };
    } catch {
      // not listening yet
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error(`Crumb did not start:\n${output}`);
}

async function stopCrumb(instance) {
  const exited = new Promise(resolve => instance.child.once('exit', resolve));
  instance.child.kill('SIGTERM');
  await exited;
}

/* A cookie-keeping client that can move between instances, like a browser tab. */
function browser() {
  const jar = new Map();
  let csrf = null;
  const call = async (origin, method, path, body, key) => {
    const headers = { origin };
    if (csrf) headers['x-csrf-token'] = csrf;
    if (jar.size) headers.cookie = [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (key) headers['idempotency-key'] = key;
    const response = await fetch(origin + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const index = pair.indexOf('=');
      jar.set(pair.slice(0, index), pair.slice(index + 1));
    }
    const data = response.status === 204 ? null : await response.json();
    if (data?.csrfToken) csrf = data.csrfToken;
    return { status: response.status, data };
  };
  return {
    call,
    async signIn(origin, password) {
      await call(origin, 'GET', '/api/session');
      return call(origin, 'POST', '/api/login', { username: 'owner', password });
    },
  };
}

const node = (script, args, env = {}, input) => spawnSync(process.execPath, [join(root, 'scripts', script), ...args], {
  env: { ...process.env, ...env }, input, encoding: 'utf8',
});

const original = join(work, 'data');
const restored = join(work, 'restored');
const backups = join(work, 'backups');
let running = null;
try {
  console.log('Start and set up');
  running = await startCrumb(original);
  const tab = browser();
  await tab.call(running.origin, 'GET', '/api/session');
  const setup = await tab.call(running.origin, 'POST', '/api/setup', {
    setupToken, username: 'owner', password: PASSWORD, displayName: 'Drill Owner',
    org: { name: 'Drill Team', mode: 'points', unitLabel: 'points', threshold: '100', locale: 'en' },
  });
  check(setup.status === 201, 'first setup creates the owner');
  const again = await tab.call(running.origin, 'POST', '/api/setup', {
    setupToken, username: 'second', password: PASSWORD, displayName: 'Second',
    org: { name: 'Again', mode: 'points', unitLabel: 'points', threshold: '100', locale: 'en' },
  });
  check(again.status === 409, 'setup cannot run twice, even with the right code');
  const grant = { userId: setup.data.user.id, amount: '150', reason: 'Drill' };
  check((await tab.call(running.origin, 'POST', '/api/admin/grants', grant, 'drill-grant-request-0001')).status === 201, 'a reward is recorded');
  check((await tab.call(running.origin, 'POST', '/api/admin/grants', grant, 'drill-grant-request-0001')).status === 201, 'the retried request is answered');

  console.log('Restart');
  await stopCrumb(running);
  running = await startCrumb(original);
  let me = await tab.call(running.origin, 'GET', '/api/me');
  check(me.status === 200, 'the session survives a restart');
  check(me.data.balance.postedUnits === 150, 'the balance survives a restart, and the retry did not add another 150');
  check(me.data.collection.length === 1, 'the collection survives a restart');

  console.log('Backup while running');
  const backup = node('backup.mjs', ['--output', join(backups, 'drill.sqlite')], { DATA_DIR: original });
  check(backup.status === 0 && /sha256 [0-9a-f]{64}/.test(backup.stdout), 'backup command succeeds and prints a checksum');
  check((await tab.call(running.origin, 'GET', '/api/me')).status === 200, 'Crumb kept serving during the backup');

  console.log('Restore into a new folder and switch');
  const restore = node('restore.mjs', ['--from', join(backups, 'drill.sqlite'), '--to', join(restored, 'crumb.sqlite')]);
  check(restore.status === 0, 'restore command succeeds');
  check(node('restore.mjs', ['--from', join(backups, 'drill.sqlite'), '--to', join(restored, 'crumb.sqlite')]).status === 1,
    'restore refuses to overwrite');
  await stopCrumb(running);
  running = await startCrumb(restored);
  check((await tab.call(running.origin, 'GET', '/api/me')).status === 401, 'old sessions do not work on the restored copy');
  check((await tab.signIn(running.origin, PASSWORD)).status === 200, 'the owner signs in on the restored copy');
  me = await tab.call(running.origin, 'GET', '/api/me');
  check(me.data.balance.postedUnits === 150 && me.data.collection.length === 1, 'restored balance and collection match');

  console.log('Owner recovery');
  const recover = node('recover-owner.mjs', ['--username', 'owner'], { DATA_DIR: restored }, `${NEW_PASSWORD}\n`);
  check(recover.status === 0 && !recover.stdout.includes(NEW_PASSWORD), 'recover-owner succeeds without echoing the password');
  check((await tab.call(running.origin, 'GET', '/api/me')).status === 401, 'recovery ends the owner sessions');
  check((await tab.signIn(running.origin, NEW_PASSWORD)).status === 200, 'the recovered password works');

  console.log('Roll back');
  await stopCrumb(running);
  running = await startCrumb(original);
  check((await tab.signIn(running.origin, PASSWORD)).status === 200, 'the original folder still has the original password');
  me = await tab.call(running.origin, 'GET', '/api/me');
  check(me.data.balance.postedUnits === 150, 'the original data is untouched');
  const log = running.output();
  check(!log.includes(PASSWORD) && !log.includes(setupToken), 'server output holds no passwords or setup code');
  console.log('Drill passed.');
} catch (error) {
  console.error(error.message);
  if (running) console.error(running.output());
  process.exitCode = 1;
} finally {
  if (running && running.child.exitCode === null) await stopCrumb(running);
  rmSync(work, { recursive: true, force: true });
}
