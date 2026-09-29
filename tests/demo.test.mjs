/* `npm run demo`: a throwaway Crumb with an invented English team, run as a person runs it. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { client, tokenFrom } from './helpers.mjs';

const demo = fileURLToPath(new URL('../scripts/demo.mjs', import.meta.url));

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

test('the demo starts an invented English team, prints how to sign in, and cleans up when stopped', async t => {
  const child = spawn(process.execPath, [demo, '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  const printed = await readUntil(child, /Stop the demo/);
  const origin = /(http:[/][/]localhost:[0-9]+)/.exec(printed)?.[1];
  assert.ok(origin, printed);
  assert.match(printed, /Owner: olive/);
  assert.match(printed, /password: [A-Za-z0-9_-]{16}/);
  const folder = /data folder: (.+)/.exec(printed)?.[1].trim();
  assert.ok(folder && existsSync(folder), printed);

  const visitor = client(origin);
  const session = await visitor.bootstrap();
  assert.equal(session.body.org.name, 'Corner Café (sample team)');
  assert.equal(session.body.org.locale, 'en');
  // The printed link signs Mina in on another browser or a phone.
  const link = /(http:[/][/]localhost:[0-9]+[/]#signin=[A-Za-z0-9_-]{43})/.exec(printed)?.[1];
  assert.ok(link, printed);
  const preview = await visitor.request('POST', '/api/signin/preview', { token: tokenFrom(link, 'signin') });
  assert.deepEqual(preview.body, { displayName: 'Mina Park' });

  if (process.platform !== 'win32') {
    // Windows cannot send a process a signal it can handle; there the folder is left to the OS.
    const exited = new Promise(resolve => child.on('exit', resolve));
    child.kill('SIGINT');
    await exited;
    assert.equal(existsSync(folder), false, 'the invented data goes when the demo stops');
  }
});
