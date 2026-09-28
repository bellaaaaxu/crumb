/* Restores a backup into a NEW database file, for a new instance or volume.
 *
 *   node scripts/restore.mjs --from /backups/crumb-2026-09-27.sqlite --to /restore/crumb.sqlite
 *
 * Refuses to write over anything, rejects damaged files and backups from a
 * newer Crumb, and clears sessions and one-time links in the restored copy:
 * everyone signs in again and invitations or resets must be issued again.
 * Point Crumb's DATA_DIR at the new location only after this succeeds, and
 * keep the old data until the restored instance has been checked. */
import { resolve } from 'node:path';
import { restoreDatabase } from '../server/backup.mjs';
import { readArgs, runCommand } from '../server/cli.mjs';

const USAGE = 'Usage: node scripts/restore.mjs --from <backup file> --to <new database file>';

runCommand(USAGE, async () => {
  const args = readArgs({ from: { type: 'string' }, to: { type: 'string' } }, ['from', 'to']);
  await restoreDatabase({ sourcePath: args.from, destinationPath: args.to });
  console.log(`restored ${resolve(args.to)}`);
  console.log('Sessions, invitation links and reset links were cleared: people sign in again, and new links are needed.');
});
