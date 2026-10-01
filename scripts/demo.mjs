/* A look around Crumb without deploying it: a throwaway copy on this computer with the
 * invented "Corner Café (sample team)", in English.
 *
 *   npm run demo                          at http://localhost:3000
 *   npm run demo -- --port 4000
 *   npm run demo -- --lan 192.168.1.20    also open to phones on the same network (use this
 *                                         computer's address), so its QR codes can be scanned
 *
 * Everything lives in a temporary folder, deleted when you stop the demo with Ctrl+C. */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { randomBytes } from 'node:crypto';
import { openDatabase } from '../server/db.mjs';
import { createApp } from '../server/app.mjs';
import { DAY, seedSampleTeam } from './sample-team.mjs';

const { values } = parseArgs({ options: { port: { type: 'string', default: '3000' }, lan: { type: 'string' } } });
const port = Number(values.port);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error('Use --port with a number from 0 to 65535.');
  process.exit(2);
}
if (values.lan !== undefined && !/^[A-Za-z0-9.-]+$/.test(values.lan)) {
  console.error('Use --lan with this computer\'s address on the network, such as 192.168.1.20.');
  process.exit(2);
}

const dir = mkdtempSync(join(tmpdir(), 'crumb-demo-'));
const password = randomBytes(12).toString('base64url');
const setupToken = randomBytes(32).toString('base64url');
writeFileSync(join(dir, 'setup-token'), setupToken);
const db = openDatabase(join(dir, 'crumb.sqlite'));
const time = { now: Date.now() - 42 * DAY, live: false };
const host = values.lan ? '0.0.0.0' : '127.0.0.1';
const server = createServer();
await new Promise(done => server.listen(port, host, done));
const actualPort = server.address().port;
const origin = `http://${values.lan ?? 'localhost'}:${actualPort}`;
server.on('request', createApp({
  db, clock: () => (time.live ? Date.now() : time.now), log: () => {},
  config: { publicOrigin: origin, dataDir: dir, dbPath: join(dir, 'crumb.sqlite'), port: actualPort, host,
    secureCookies: false, setupTokenFile: join(dir, 'setup-token'), trustProxy: false, allowLocalHttp: true },
}));

let stopped = false;
function stop() {
  if (stopped) return;
  stopped = true;
  server.closeAllConnections();
  server.close();
  db.close();
  rmSync(dir, { recursive: true, force: true });
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stop();
    process.exit(0);
  });
}

const { owner, people } = await seedSampleTeam({ origin, direct: `http://127.0.0.1:${actualPort}`, setupToken, password, time });
time.live = true;
const { signinUrl } = await owner.send('POST', `/api/admin/members/${people.mina.id}/signin-link`);

console.log(`
Crumb demo, with an invented team ("Corner Café (sample team)"), at ${origin}

  Owner: olive   password: ${password}
  Mina Park, a team member, signs in with this one-time link. Open it in a private window
  or on a phone:
    ${signinUrl}
  More sign-in links, with their QR codes: Team, then a person's name, then "New sign-in link".

  data folder: ${dir}
Stop the demo with Ctrl+C; the invented data is deleted then.`);
