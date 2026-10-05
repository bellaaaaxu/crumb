import { readdirSync, readFileSync } from 'node:fs';
import { AppError } from './errors.mjs';

/* The collection themes this version of Crumb ships. Each is a list file, themes/<id>.json,
 * generated from assets/sprites.js by scripts/theme-manifest.mjs and never edited by hand:
 * { themeId, version, source, mascot, keys, names }. The files, not the database, decide
 * which themes exist (organization.theme only has its shape checked, migration 003), so a
 * team whose theme is not among them is refused when its database is opened or restored.
 * Read once, when this module is first imported. */
export const DEFAULT_THEME = 'default';

const themesDir = new URL('../themes/', import.meta.url);
const fileIds = readdirSync(themesDir)
  .filter(name => name.endsWith('.json'))
  .map(name => name.slice(0, -'.json'.length))
  .sort();

/* The default theme first, then the others by id. */
export const THEME_IDS = [...fileIds.filter(id => id === DEFAULT_THEME), ...fileIds.filter(id => id !== DEFAULT_THEME)];

/* id -> that theme's list, in THEME_IDS order. */
export const THEMES = new Map(THEME_IDS.map(id => [id, JSON.parse(readFileSync(new URL(`${id}.json`, themesDir), 'utf8'))]));

/* The list for a theme id, or undefined for one this version does not ship. */
export const themeById = id => THEMES.get(id);

/* The team's theme id as stored (needs schema 3, which every connection from openDatabase
 * has). Before setup there is no team yet, and the default theme applies. */
export function orgThemeId(db) {
  return db.prepare('SELECT theme FROM organization WHERE id = 1').get()?.theme ?? DEFAULT_THEME;
}

/* The team's theme list. Only a missing team falls back to the default: a stored id this
 * version does not ship is refused, never swapped for another theme. */
export function orgTheme(db) {
  const id = orgThemeId(db);
  const theme = themeById(id);
  if (!theme) throw unknownThemeError(id);
  return theme;
}

export function unknownThemeError(id) {
  return new AppError(500, 'THEME_UNKNOWN',
    `This database uses the collection theme "${id}", which this version of Crumb does not include. ` +
    'Run a newer Crumb, or restore a backup made by this version.');
}

/**
 * Refuses a database whose team uses a theme this version does not ship, the way a newer
 * schema is refused (server/db.mjs). A database with no team yet passes, and so does one
 * from before schema 3, which has no theme column: its team is on the default theme once
 * Crumb brings the schema up to date.
 */
export function checkDatabaseTheme(db) {
  if (!db.prepare(`SELECT 1 FROM pragma_table_info('organization') WHERE name = 'theme'`).get()) return;
  const id = orgThemeId(db);
  if (!themeById(id)) throw unknownThemeError(id);
}
