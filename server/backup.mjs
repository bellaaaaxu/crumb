import { createHash, randomUUID } from 'node:crypto';
import { constants, createReadStream, createWriteStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { chmod, copyFile, link, rm, unlink } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { SCHEMA_VERSION, schemaVersionOf, tooNewError } from './db.mjs';

const failure = (code, message) => Object.assign(new Error(message), { code });
/* Backups and databases hold password hashes: owner-only. (No effect on Windows.) */
const PRIVATE = 0o600;
const COMPANIONS = ['-wal', '-shm', '-journal'];

async function sha256Of(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function removeWithCompanions(path) {
  for (const suffix of ['', ...COMPANIONS]) await rm(`${path}${suffix}`, { force: true });
}

const sizeOf = path => {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
};

/**
 * Puts `from` at `to` without ever replacing an existing file. The move has
 * worked once this returns; if the temporary name could not be removed
 * afterwards (a virus scanner holding it, say), its path is returned.
 */
async function moveIntoPlace(from, to) {
  try {
    await link(from, to);
  } catch (error) {
    if (error.code === 'EEXIST') throw failure('TARGET_EXISTS', `${to} already exists.`);
    if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV', 'ENOSYS'].includes(error.code)) throw error;
    // No hard links here. An exclusive copy still never replaces a file.
    try {
      await copyFile(from, to, constants.COPYFILE_EXCL);
    } catch (copyError) {
      if (copyError.code === 'EEXIST') throw failure('TARGET_EXISTS', `${to} already exists.`);
      await rm(to, { force: true }); // created by this copy (EXCL), so only a partial file of ours is removed
      throw copyError;
    }
  }
  try {
    await unlink(from);
    return null;
  } catch {
    return from;
  }
}

/**
 * Copies a live database into a new single file with SQLite's online backup
 * API. The copy is one consistent moment even while the app keeps writing
 * (including changes still in the WAL), is checked, is readable by its owner
 * only, and never replaces an existing file. `pagesPerStep` exists for tests.
 */
export async function backupDatabase(db, outputPath, { pagesPerStep = 256 } = {}) {
  const output = resolve(outputPath);
  if (existsSync(output)) throw failure('TARGET_EXISTS', `${output} already exists. Backups never overwrite; choose a new name.`);
  mkdirSync(dirname(output), { recursive: true });
  const partial = join(dirname(output), `.${basename(output)}.partial-${randomUUID()}`);
  try {
    // Created empty and private first, so the copy is never readable by others, even while it is written.
    writeFileSync(partial, '', { flag: 'wx', mode: PRIVATE });
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
    await chmod(partial, PRIVATE);
    const leftover = await moveIntoPlace(partial, output);
    return { path: output, sha256: await sha256Of(output), schemaVersion, ...(leftover && { leftover }) };
  } catch (error) {
    await removeWithCompanions(partial);
    throw error;
  }
}

const hasTable = (db, name) => Boolean(db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name));

/* Every page, every index against its table, and every reference. */
function isHealthy(db) {
  return db.pragma('integrity_check', { simple: true }) === 'ok' && db.pragma('foreign_key_check').length === 0;
}

/**
 * Restores a backup into a new file that does not exist yet. The work happens
 * in a temporary file beside the target: it must pass a full integrity and
 * reference check, be a Crumb database no newer than this version, and then
 * loses every session, invitation link and reset link (people sign in again;
 * links are issued again). Only then is it moved into place.
 *
 * The copy keeps the schema version the backup has. Crumb brings it up to
 * date when it starts, so restoring an older backup to roll back an upgrade
 * works whichever version runs the restore. Users, the ledger, requests,
 * collections, stored responses and the logo are kept as they were.
 */
export async function restoreDatabase({ sourcePath, destinationPath }) {
  const source = resolve(sourcePath);
  const destination = resolve(destinationPath);
  if (source === destination) throw failure('SAME_FILE', 'The backup and the restore target are the same file.');
  if (!existsSync(source)) throw failure('SOURCE_MISSING', `${source} does not exist.`);
  if (sizeOf(`${source}-wal`) > 0 || sizeOf(`${source}-journal`) > 0)
    throw failure('SOURCE_IN_USE', `${source} has a -wal or -journal file beside it: it is in use or was not closed ` +
      'cleanly, and part of its data is in that file. Restore a file made by the backup command, or stop the Crumb using it first.');
  for (const suffix of ['', ...COMPANIONS]) {
    if (existsSync(`${destination}${suffix}`))
      throw failure('TARGET_EXISTS', `${destination}${suffix} already exists. Restore into a new, empty location.`);
  }
  mkdirSync(dirname(destination), { recursive: true });
  const temp = join(dirname(destination), `.${basename(destination)}.restoring-${randomUUID()}`);
  let copy = null;
  try {
    // Streamed into a file that is private from its first byte (copyFile would give it the source's mode).
    await pipeline(createReadStream(source), createWriteStream(temp, { flags: 'wx', mode: PRIVATE }));
    await chmod(temp, PRIVATE);
    let healthy = false;
    try {
      copy = new Database(temp, { fileMustExist: true });
      copy.pragma('journal_mode = DELETE');
      healthy = isHealthy(copy);
    } catch {
      healthy = false;
    }
    if (!healthy) throw failure('INVALID_BACKUP', 'That file is damaged or is not an SQLite database.');
    const version = schemaVersionOf(copy);
    if (version === 0 || !['organization', 'ledger', 'sessions', 'tokens', 'login_limits'].every(name => hasTable(copy, name)))
      throw failure('INVALID_BACKUP', 'That database is not a Crumb backup.');
    if (version > SCHEMA_VERSION) throw tooNewError(version);
    copy.transaction(() => copy.exec('DELETE FROM sessions; DELETE FROM tokens; DELETE FROM login_limits;'))();
    copy.close();
    copy = null;
    const leftover = await moveIntoPlace(temp, destination);
    return { path: destination, schemaVersion: version, ...(leftover && { leftover }) };
  } catch (error) {
    if (copy?.open) copy.close();
    await removeWithCompanions(temp);
    throw error;
  }
}
