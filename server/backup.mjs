import { createHash, randomUUID } from 'node:crypto';
import { constants, createReadStream, existsSync, mkdirSync } from 'node:fs';
import { copyFile, link, rename, rm, unlink } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { SCHEMA_VERSION, openDatabase, schemaVersionOf, tooNewError } from './db.mjs';

const failure = (code, message) => Object.assign(new Error(message), { code });

async function sha256Of(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function removeWithCompanions(path) {
  for (const suffix of ['', '-wal', '-shm', '-journal']) await rm(`${path}${suffix}`, { force: true });
}

/* Puts `from` at `to` without ever replacing an existing file. */
async function moveIntoPlace(from, to) {
  try {
    await link(from, to);
    await unlink(from);
  } catch (error) {
    if (error.code === 'EEXIST') throw failure('TARGET_EXISTS', `${to} already exists.`);
    if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV'].includes(error.code)) throw error;
    // Filesystems without hard links: check, then rename.
    if (existsSync(to)) throw failure('TARGET_EXISTS', `${to} already exists.`);
    await rename(from, to);
  }
}

/**
 * Copies a live database into a new single file with SQLite's online backup
 * API. The copy is one consistent moment even while the app keeps writing
 * (including changes still in the WAL), is checked with quick_check, and
 * never replaces an existing file. `pagesPerStep` exists for tests.
 */
export async function backupDatabase(db, outputPath, { pagesPerStep = 256 } = {}) {
  const output = resolve(outputPath);
  if (existsSync(output)) throw failure('TARGET_EXISTS', `${output} already exists. Backups never overwrite; choose a new name.`);
  mkdirSync(dirname(output), { recursive: true });
  const partial = join(dirname(output), `.${basename(output)}.partial-${randomUUID()}`);
  try {
    await db.backup(partial, { progress: () => pagesPerStep });
    const copy = new Database(partial, { fileMustExist: true });
    let schemaVersion;
    try {
      // A backup is one self-contained file: no -wal or -shm beside it.
      copy.pragma('journal_mode = DELETE');
      const check = copy.pragma('quick_check', { simple: true });
      if (check !== 'ok') throw failure('BACKUP_CHECK_FAILED', `The new backup failed its integrity check: ${check}`);
      schemaVersion = schemaVersionOf(copy);
    } finally {
      copy.close();
    }
    await moveIntoPlace(partial, output);
    return { path: output, sha256: await sha256Of(output), schemaVersion };
  } catch (error) {
    await removeWithCompanions(partial);
    throw error;
  }
}

const hasTable = (db, name) => Boolean(db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name));

/**
 * Restores a backup into a new file that does not exist yet. The work happens
 * in a temporary file beside the target: it must pass quick_check, be a Crumb
 * database no newer than this version, and then loses every session,
 * invitation link and reset link (people sign in again; links are issued
 * again). Only then is it moved into place. Users, the ledger, requests,
 * collections, stored responses and the logo are kept as they were.
 */
export async function restoreDatabase({ sourcePath, destinationPath }) {
  const source = resolve(sourcePath);
  const destination = resolve(destinationPath);
  if (source === destination) throw failure('SAME_FILE', 'The backup and the restore target are the same file.');
  if (!existsSync(source)) throw failure('SOURCE_MISSING', `${source} does not exist.`);
  if (existsSync(destination)) throw failure('TARGET_EXISTS', `${destination} already exists. Restore into a new, empty location.`);
  mkdirSync(dirname(destination), { recursive: true });
  const temp = join(dirname(destination), `.${basename(destination)}.restoring-${randomUUID()}`);
  let copy = null;
  try {
    await copyFile(source, temp, constants.COPYFILE_EXCL);
    let healthy = false;
    try {
      copy = new Database(temp, { fileMustExist: true });
      copy.pragma('journal_mode = DELETE');
      healthy = copy.pragma('quick_check', { simple: true }) === 'ok';
    } catch {
      healthy = false;
    }
    if (!healthy) throw failure('INVALID_BACKUP', 'That file is damaged or is not an SQLite database.');
    const version = schemaVersionOf(copy);
    if (version === 0 || !hasTable(copy, 'organization') || !hasTable(copy, 'ledger'))
      throw failure('INVALID_BACKUP', 'That database is not a Crumb backup.');
    if (version > SCHEMA_VERSION) throw tooNewError(version);
    copy.transaction(() => copy.exec('DELETE FROM sessions; DELETE FROM tokens; DELETE FROM login_limits;'))();
    copy.close();
    copy = null;
    // Brings an older backup up to date and proves it opens the way the app will open it.
    openDatabase(temp).close();
    await moveIntoPlace(temp, destination);
  } catch (error) {
    if (copy?.open) copy.close();
    await removeWithCompanions(temp);
    throw error;
  }
}
