/* Test-only helpers. Nothing here is imported by the server. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { openDatabase } from '../server/db.mjs';

/* Fixture users cannot log in: the marker below is not a valid password hash. */
export const FIXTURE_PASSWORD_HASH = 'fixture-no-login';

/**
 * A fresh on-disk database with an organization and three active users.
 * Cleans up only its own temporary directory.
 */
export function fixture(t, { mode = 'credit', thresholdUnits = 5000 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'crumb-test-'));
  const path = join(dir, 'crumb.sqlite');
  const db = openDatabase(path);
  const createdAt = new Date().toISOString();
  db.prepare(`INSERT INTO organization (id, name, mode, currency, unit_label, threshold_units, locale, created_at)
              VALUES (1, 'Test Team', @mode, @currency, @unitLabel, @thresholdUnits, 'en', @createdAt)`).run({
    mode,
    currency: mode === 'credit' ? 'CAD' : null,
    unitLabel: mode === 'credit' ? 'Team credit' : 'points',
    thresholdUnits,
    createdAt,
  });
  const insertUser = db.prepare(`INSERT INTO users (id, username, display_name, password_hash, role, active, created_at)
                                 VALUES (@id, @username, @displayName, @passwordHash, @role, 1, @createdAt)`);
  const user = (username, displayName, role) => {
    const row = { id: randomUUID(), username, displayName, role, passwordHash: FIXTURE_PASSWORD_HASH, createdAt };
    insertUser.run(row);
    return { id: row.id, role, username, displayName };
  };
  const owner = user('owner', 'Olive Owner', 'owner');
  const member = user('member', 'Mina Member', 'member');
  const member2 = user('member2', 'Mo Member', 'member');

  t.after(() => {
    if (db.open) db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { db, owner, member, member2, path, dir };
}

/**
 * Listens on a random localhost port. `build(origin)` returns the request
 * handler, because the app has to know its exact public origin up front.
 */
export async function serve(t, build) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  server.on('request', build(origin));
  t.after(() => new Promise(resolve => {
    server.closeAllConnections();
    server.close(() => resolve());
  }));
  return origin;
}
