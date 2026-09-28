/* Prepares a fresh deployment folder:
 *
 *   node scripts/init-secrets.mjs                                   try it on this computer
 *   node scripts/init-secrets.mjs --origin https://crumb.example.com real deployment behind HTTPS
 *
 * Writes .secrets/setup-token — a random one-time code for creating the
 * first owner — and a starting .env for Docker Compose. Existing files are
 * kept, never overwritten. The code is never printed: read it from the file
 * on the server when you open Crumb for the first time.
 *
 * The .secrets folder is closed to everyone but you (0700). The code file
 * inside it is readable (0644) so the container can read it whatever user id
 * your account has: Compose mounts that one file, so the container never
 * needs to open the folder. */
import { randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { readArgs, runCommand, usageError } from '../server/cli.mjs';

const USAGE = 'Usage: node scripts/init-secrets.mjs [--origin https://your.domain]';

function environmentFor(origin) {
  if (!origin) {
    return [
      '# Crumb on this computer only: http://localhost:3000',
      'PUBLIC_ORIGIN=http://localhost:3000',
      'ALLOW_LOCAL_HTTP=true',
      '',
    ].join('\n');
  }
  let url;
  try {
    url = new URL(origin);
  } catch {
    throw usageError(`--origin must be a URL like https://crumb.example.com (got "${origin}").`);
  }
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password)
    throw usageError('--origin must be https:// followed by just the host name, for example https://crumb.example.com.');
  return [
    '# Crumb behind HTTPS. COMPOSE_FILE adds compose.https.yaml (Caddy) to every docker compose command.',
    `PUBLIC_ORIGIN=${url.origin}`,
    'ALLOW_LOCAL_HTTP=false',
    `SITE_ADDRESS=${url.host}`,
    'COMPOSE_PATH_SEPARATOR=:',
    'COMPOSE_FILE=compose.yaml:compose.https.yaml',
    '',
  ].join('\n');
}

/* Creates the file only if it does not exist yet; reports which happened. */
function writeOnce(path, content, mode) {
  try {
    writeFileSync(path, content, { flag: 'wx', mode });
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  }
}

runCommand(USAGE, async () => {
  const args = readArgs({ origin: { type: 'string' } });
  const environment = environmentFor(args.origin);
  mkdirSync('.secrets', { recursive: true, mode: 0o700 });
  chmodSync('.secrets', 0o700);
  const token = randomBytes(32).toString('base64url');
  if (writeOnce('.secrets/setup-token', `${token}\n`, 0o644)) {
    // Set the mode outright: a strict umask (027, 077) would otherwise hide it from the container.
    chmodSync('.secrets/setup-token', 0o644);
    console.log('Wrote .secrets/setup-token (the code is not shown here).');
    console.log('  Read it on the server when you first open Crumb:  cat .secrets/setup-token');
  } else {
    console.log('Kept the existing .secrets/setup-token. Delete it first if you need a new code.');
  }
  if (writeOnce('.env', environment, 0o600)) console.log(`Wrote .env for ${args.origin ?? 'http://localhost:3000'}.`);
  else console.log('Kept the existing .env.');
});
