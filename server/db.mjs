import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { AppError } from './errors.mjs';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

/* 001-initial.sql -> { version: 1, sql } — numbered, applied in order, never edited once released. */
const MIGRATIONS = readdirSync(migrationsDir)
  .map(name => /^(\d{3})-[a-z0-9-]+\.sql$/.exec(name))
  .filter(Boolean)
  .map(match => ({ version: Number(match[1]), sql: readFileSync(join(migrationsDir, match[0]), 'utf8') }))
  .sort((a, b) => a.version - b.version);

MIGRATIONS.forEach((migration, index) => {
  if (migration.version !== index + 1) throw new Error(`Migration numbering has a gap at ${migration.version}`);
});

export const SCHEMA_VERSION = MIGRATIONS.at(-1).version;

/**
 * Opens (or creates) the database and brings its schema up to date before
 * anything else can use it. A database written by a newer Crumb is refused
 * rather than guessed at. Migrations run with foreign keys off and every
 * reference is verified before they commit; the connection handed back
 * enforces foreign keys. A new database file is readable by its owner only
 * (it holds password hashes); SQLite gives its -wal and -shm the same mode.
 */
export function openDatabase(path) {
  try {
    writeFileSync(path, '', { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  const db = new Database(path);
  try {
    db.pragma('busy_timeout = 5000');
    db.pragma('journal_mode = WAL');
    migrate(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function schemaVersionOf(db) {
  const table = db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'`).get();
  if (!table) return 0;
  return db.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations').get().version;
}

export function tooNewError(version) {
  return new AppError(500, 'SCHEMA_TOO_NEW',
    `This database uses schema ${version}, but this version of Crumb only understands up to ${SCHEMA_VERSION}. ` +
    'Run a newer Crumb, or restore a backup made by this version.');
}

/* A migration may rebuild a table other tables point at (002 does), which SQLite only allows
 * with foreign keys off. The pragma cannot change inside a transaction, so it is switched off
 * around the run and back on however the run ends.
 *
 * With foreign keys off nothing stops a migration from leaving a reference to a missing row,
 * so after one has run every reference is checked before the transaction commits, and a bad
 * one rolls the whole update back. A database that is already current is not checked: an
 * unrelated stray row must not keep Crumb, or owner recovery, from starting. */
function migrate(db) {
  db.pragma('foreign_keys = OFF');
  try {
    db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
    db.transaction(() => {
      const current = schemaVersionOf(db);
      if (current > SCHEMA_VERSION) throw tooNewError(current);
      const pending = MIGRATIONS.filter(migration => migration.version > current);
      for (const migration of pending) {
        db.exec(migration.sql);
        db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
          .run(migration.version, new Date().toISOString());
      }
      if (pending.length === 0) return;
      const broken = db.pragma('foreign_key_check');
      if (broken.length) throw danglingReferencesError(pending.at(-1).version, broken);
    }).immediate();
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

/* Names a few of the rows, so whoever runs the update knows where to look. */
function danglingReferencesError(version, broken) {
  const first = broken.slice(0, 3).map(({ table, rowid, parent }) => `${table} row ${rowid} -> ${parent}`).join(', ');
  return new Error(`Updating the database to schema ${version} was stopped and nothing was changed: ` +
    `${broken.length} reference(s) point at missing rows (first: ${first}).`);
}

export function isBusy(error) {
  return typeof error?.code === 'string' && error.code.startsWith('SQLITE_BUSY');
}

/**
 * Every write goes through here: one short IMMEDIATE transaction, so the
 * checks inside it and the writes that depend on them cannot interleave with
 * another writer. The body must be synchronous — no await inside.
 * Nested calls become savepoints of the outer transaction.
 */
export function writeTransaction(db, body) {
  try {
    return db.transaction(body).immediate();
  } catch (error) {
    if (isBusy(error)) throw new AppError(503, 'RETRY_LATER', 'Crumb is busy right now. Please try again.');
    throw error;
  }
}

export const isoNow = clock => new Date(clock()).toISOString();
