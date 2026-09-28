/* Makes a consistent backup of the live database while Crumb keeps running.
 *
 *   node scripts/backup.mjs --output /backups/crumb-2026-09-27.sqlite [--data-dir /data]
 *
 * Writes one new, self-contained SQLite file (never overwrites), checks it,
 * and prints its path and SHA-256. The logo is inside the database, so it is
 * included. The file is readable only by the user who runs this; keep
 * backups somewhere only the server's operators can read. */
import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import { backupDatabase } from '../server/backup.mjs';
import { databasePath, readArgs, runCommand } from '../server/cli.mjs';

const USAGE = 'Usage: node scripts/backup.mjs --output <new file> [--data-dir <directory>]';

runCommand(USAGE, async () => {
  const args = readArgs({ output: { type: 'string' }, 'data-dir': { type: 'string' } }, ['output']);
  const path = databasePath(args['data-dir']);
  if (!existsSync(path)) throw new Error(`There is no database at ${path}. Set DATA_DIR or --data-dir.`);
  const db = new Database(path, { fileMustExist: true });
  try {
    db.pragma('busy_timeout = 5000');
    const result = await backupDatabase(db, args.output);
    console.log(`backup ${result.path}`);
    console.log(`sha256 ${result.sha256}`);
    console.log(`schema ${result.schemaVersion}`);
    if (result.leftover) console.log(`Note: the temporary file ${result.leftover} could not be removed. It can be deleted.`);
  } finally {
    db.close();
  }
});
