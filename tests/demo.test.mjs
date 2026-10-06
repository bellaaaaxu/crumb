/* `npm run demo`: a throwaway Crumb with an invented English team, run as a person runs it. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { client, tokenFrom } from './helpers.mjs';
import { THEME_IDS, themeById } from '../server/themes.mjs';

const demo = fileURLToPath(new URL('../scripts/demo.mjs', import.meta.url));
const dataFolder = printed => /data folder: (.+)/.exec(printed)?.[1].trim();

/* Stops the demo if it still runs, then deletes the data folder it printed. On Windows a
 * killed process cannot run its own clean-up, and each run would leave a folder behind.
 * Only a crumb-demo-* folder in the temporary directory is ever deleted. */
async function stopDemo(child, printed) {
  if (child.exitCode === null && child.signalCode === null) {
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill();
    await exited;
  }
  const folder = dataFolder(printed);
  if (folder && dirname(folder) === tmpdir() && basename(folder).startsWith('crumb-demo-'))
    rmSync(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

/* Resolves with everything printed once `done` matches it; fails at once if the command stops. */
function readUntil(child, done, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    let text = '';
    let errors = '';
    const timer = setTimeout(() => reject(new Error(`timed out; printed so far:\n${text}${errors}`)), timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { errors += chunk; });
    child.on('exit', code => {
      clearTimeout(timer);
      reject(new Error(`the demo stopped (${code}):\n${text}${errors}`));
    });
    child.stdout.on('data', chunk => {
      text += chunk;
      if (done.test(text)) {
        clearTimeout(timer);
        resolve(text);
      }
    });
  });
}

/* Starts the demo on a free port with these extra options; stops it and deletes its data when the test ends. */
async function startDemo(t, options = []) {
  const child = spawn(process.execPath, [demo, '--port', '0', ...options], { stdio: ['ignore', 'pipe', 'pipe'] });
  // Everything printed, also when the test fails before the demo has finished starting.
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  t.after(() => stopDemo(child, output));
  return { child, printed: await readUntil(child, /Stop the demo/) };
}

test('the demo starts an invented English team that spends on trust, prints how to sign in, and cleans up when stopped', async t => {
  const { child, printed } = await startDemo(t);
  const origin = /(http:[/][/]localhost:[0-9]+)/.exec(printed)?.[1];
  assert.ok(origin, printed);
  assert.match(printed, /Owner: olive/);
  assert.match(printed, /password: [A-Za-z0-9_-]{16}/);
  const folder = dataFolder(printed);
  assert.ok(folder && existsSync(folder), printed);

  const visitor = client(origin);
  const session = await visitor.bootstrap();
  assert.equal(session.body.org.name, 'Corner Café (sample team)');
  assert.equal(session.body.org.locale, 'en');
  // On Pastry shop unless --theme says otherwise.
  assert.equal(session.body.org.theme, 'default');
  // The printed link signs Mina in on another browser or a phone.
  const link = /(http:[/][/]localhost:[0-9]+[/]#signin=[A-Za-z0-9_-]{43})/.exec(printed)?.[1];
  assert.ok(link, printed);
  const preview = await visitor.request('POST', '/api/signin/preview', { token: tokenFrom(link, 'signin') });
  assert.deepEqual(preview.body, { displayName: 'Mina Park' });

  // The sample team spends on trust: no benefits to request, only what Mina jotted down herself.
  const password = /password: ([A-Za-z0-9_-]{16})/.exec(printed)[1];
  const owner = client(origin);
  await owner.bootstrap();
  const login = await owner.request('POST', '/api/login', { username: 'olive', password });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  const signedIn = await owner.request('GET', '/api/session');
  assert.equal(signedIn.body.org.spending, 'self');
  assert.deepEqual((await owner.request('GET', '/api/admin/rewards')).body.items, []);
  assert.deepEqual((await owner.request('GET', '/api/admin/redemptions')).body.items, []);
  const spends = (await owner.request('GET', '/api/admin/ledger?kind=spend')).body.items;
  assert.deepEqual(spends.map(entry => [entry.member.username, entry.deltaUnits]), [['mina', -1400], ['mina', -450]]);

  if (process.platform !== 'win32') {
    // Windows cannot send a process a signal it can handle; there the test deletes the folder.
    const exited = new Promise(resolve => child.on('exit', resolve));
    child.kill('SIGINT');
    await exited;
    assert.equal(existsSync(folder), false, 'the invented data goes when the demo stops');
  }
});

test('with --theme bakery the demo starts the same team on the Bakery collection theme', async t => {
  const { printed } = await startDemo(t, ['--theme', 'bakery']);
  const origin = /(http:[/][/]localhost:[0-9]+)/.exec(printed)?.[1];
  assert.ok(origin, printed);

  // The sign-in page already knows the theme.
  const visitor = client(origin);
  const session = await visitor.bootstrap();
  assert.equal(session.body.org.name, 'Corner Café (sample team)');
  assert.equal(session.body.org.theme, 'bakery');

  // The owner sees it too, fixed by the treats the team has already had.
  const password = /password: ([A-Za-z0-9_-]{16})/.exec(printed)[1];
  const owner = client(origin);
  await owner.bootstrap();
  const login = await owner.request('POST', '/api/login', { username: 'olive', password });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  const signedIn = await owner.request('GET', '/api/session');
  assert.equal(signedIn.body.org.theme, 'bakery');
  assert.equal(signedIn.body.org.locks.theme, true);

  // Mina, signed in with the printed link, has Bakery items on her shelf: 125.00 received at 25.00 a step.
  const link = /(http:[/][/]localhost:[0-9]+[/]#signin=[A-Za-z0-9_-]{43})/.exec(printed)?.[1];
  assert.ok(link, printed);
  const mina = client(origin);
  await mina.bootstrap();
  const accepted = await mina.request('POST', '/api/signin/accept', { token: tokenFrom(link, 'signin') });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  mina.csrf = accepted.body.csrfToken;
  const me = await mina.request('GET', '/api/me');
  assert.equal(me.status, 200, JSON.stringify(me.body));
  const bakery = themeById('bakery').keys;
  assert.equal(me.body.theme.id, 'bakery');
  assert.equal(me.body.theme.size, bakery.length);
  assert.equal(me.body.collection.length, 5);
  for (const item of me.body.collection) assert.ok(bakery.includes(item.spriteKey), item.spriteKey);
});

test('the demo refuses a theme this version does not include, before it makes anything', { timeout: 60000 }, async t => {
  // The demo's data folders already in the temporary directory. Only this file makes them, its
  // tests run one after another, and each earlier test's t.after has deleted its own folder.
  const demoFolders = () => readdirSync(tmpdir()).filter(name => name.startsWith('crumb-demo-')).sort();
  const before = demoFolders();
  const child = spawn(process.execPath, [demo, '--port', '0', '--theme', 'unicorn'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let printed = '';
  let errors = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { printed += chunk; });
  child.stderr.on('data', chunk => { errors += chunk; });
  // Should it start after all, the time limit ends the test and this stops it and deletes its folder.
  t.after(() => stopDemo(child, printed));
  const code = await new Promise(resolve => child.on('close', resolve));
  assert.equal(code, 2, errors);
  // No data folder was made. The demo names its folder only once it has started, so look on disk.
  assert.deepEqual(demoFolders(), before);
  // Nothing was printed.
  assert.equal(printed, '');
  // Only the one line, naming every theme this version has, in order.
  assert.equal(errors, `Use --theme with one of: ${THEME_IDS.join(', ')}.\n`);
});
