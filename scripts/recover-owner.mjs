/* Sets a new password for an owner who is locked out. Run on the server by
 * whoever operates it — there is no web page for this on purpose.
 *
 *   node scripts/recover-owner.mjs --username alice [--data-dir /data]
 *
 * The new password is read from standard input: typed without being shown on
 * a terminal (twice), or piped. It is never taken as an argument, because
 * arguments end up in shell history and process lists. The owner's sessions
 * and links end, and the change is written to the activity log. */
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { writeAudit } from '../server/audit.mjs';
import { databasePath, readArgs, runCommand } from '../server/cli.mjs';
import { openDatabase, writeTransaction } from '../server/db.mjs';
import { hashPassword, validatePassword } from '../server/passwords.mjs';

const USAGE = 'Usage: node scripts/recover-owner.mjs --username <owner username> [--data-dir <directory>]';

function readHidden(prompt) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    let value = '';
    process.stdout.write(prompt);
    input.setRawMode(true);
    input.setEncoding('utf8');
    const finish = error => {
      input.setRawMode(false);
      input.pause();
      input.off('data', onData);
      process.stdout.write('\n');
      if (error) reject(error); else resolve(value);
    };
    const onData = chunk => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') return finish();
        if (char === '\u0003') return finish(new Error('Cancelled.'));
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else value += char;
      }
    };
    input.on('data', onData);
    input.resume();
  });
}

async function readPassword() {
  if (process.stdin.isTTY) {
    const first = await readHidden('New password for this owner (not shown): ');
    const second = await readHidden('Type it again: ');
    if (first !== second) throw new Error('The two passwords do not match. Nothing was changed.');
    return first;
  }
  let piped = '';
  for await (const chunk of process.stdin) piped += chunk;
  return piped.split(/\r?\n/)[0];
}

runCommand(USAGE, async () => {
  const args = readArgs({ username: { type: 'string' }, 'data-dir': { type: 'string' } }, ['username']);
  const username = args.username.trim().toLowerCase();
  const path = databasePath(args['data-dir']);
  if (!existsSync(path)) throw new Error(`There is no database at ${path}. Set DATA_DIR or --data-dir.`);
  const password = await readPassword();
  try {
    validatePassword(password);
  } catch {
    throw new Error('Use a password of 12 to 128 characters. Nothing was changed.');
  }
  const passwordHash = await hashPassword(password);
  const db = openDatabase(path);
  try {
    const owner = writeTransaction(db, () => {
      const row = db.prepare('SELECT id, role, active FROM users WHERE username = ?').get(username);
      if (!row) throw new Error(`There is no account named ${username}.`);
      if (row.role !== 'owner')
        throw new Error(`${username} is not an owner. Owners and admins reset other accounts from the Team page.`);
      const now = new Date().toISOString();
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, row.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.id);
      db.prepare('UPDATE tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL').run(now, row.id);
      writeAudit(db, { actorId: null, action: 'owner.recover', targetId: row.id, detail: { ref: randomBytes(4).toString('hex') } }, now);
      return row;
    });
    console.log(`The password for ${username} was changed and their sessions were ended.`);
    if (owner.active !== 1) console.log('Note: this owner account is deactivated. Another owner can reactivate it from the Team page.');
  } finally {
    db.close();
  }
});
