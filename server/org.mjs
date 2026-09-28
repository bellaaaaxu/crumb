import sharp from 'sharp';
import { AppError } from './errors.mjs';
import { writeTransaction } from './db.mjs';
import { writeAudit } from './audit.mjs';
import { freshActor, requireRole } from './permissions.mjs';
import { parseUnits } from './units.mjs';
import { amount, invalid, oneOf, readObject, text } from './validate.mjs';

export const CURRENCIES = ['CAD', 'USD', 'CNY'];
export const LOCALES = ['en', 'zh-CN'];
const OWNER = ['owner'];

const ORG_COLUMNS = `name, mode, currency, unit_label, threshold_units, locale, welcome,
  admin_contact, feedback_url, (logo_png IS NOT NULL) AS has_logo,
  EXISTS (SELECT 1 FROM ledger) AS has_ledger, EXISTS (SELECT 1 FROM rewards) AS has_rewards`;

export const readOrgRow = db => db.prepare(`SELECT ${ORG_COLUMNS} FROM organization WHERE id = 1`).get();

/* Signed-out visitors see only what the sign-in page needs. */
export function orgView(row, { signedIn }) {
  if (!row) return null;
  if (!signedIn) return { name: row.name, locale: row.locale, hasLogo: row.has_logo === 1 };
  return {
    name: row.name,
    mode: row.mode,
    currency: row.currency,
    unitLabel: row.unit_label,
    thresholdUnits: row.threshold_units,
    locale: row.locale,
    welcome: row.welcome,
    adminContact: row.admin_contact,
    feedbackUrl: row.feedback_url,
    hasLogo: row.has_logo === 1,
    // Once anything is recorded the rules are fixed; once benefits are priced, so is the unit.
    locks: { mode: row.has_ledger === 1 || row.has_rewards === 1, threshold: row.has_ledger === 1 },
  };
}

export function requireOrg(db) {
  const row = readOrgRow(db);
  if (!row) throw new AppError(409, 'NOT_INITIALIZED', 'Crumb has not been set up yet.');
  return row;
}

const NEW_ORG = {
  name: text({ min: 1, max: 80 }),
  mode: oneOf(['credit', 'points']),
  currency: oneOf(CURRENCIES, { optional: true }),
  unitLabel: text({ min: 1, max: 24 }),
  threshold: amount(),
  locale: oneOf(LOCALES),
  welcome: text({ max: 500, optional: true, multiline: true }),
};

/* Reward rules chosen at first setup: credit needs a currency, points must not have one. */
export function readNewOrg(input) {
  const org = readObject(input, NEW_ORG, 'org.');
  if (org.mode === 'credit' && !org.currency) throw invalid('org.currency', 'Choose a currency for credit.');
  if (org.mode === 'points' && org.currency) throw invalid('org.currency', 'Points do not use a currency.');
  return {
    name: org.name,
    mode: org.mode,
    currency: org.currency ?? null,
    unitLabel: org.unitLabel,
    thresholdUnits: parseUnits(org.threshold, org.mode),
    locale: org.locale,
    welcome: org.welcome ?? '',
  };
}

/* ---------------------------------------------------------------- links */

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

const isHttps = url => url?.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;

/* Where members reach their own organization: an https page or a mailto address. */
const contactLink = () => (value, field) => {
  const link = text({ max: 300, optional: true })(value, field);
  if (!link) return link;
  const url = parseUrl(link);
  if (isHttps(url)) return link;
  if (url?.protocol === 'mailto:' && /^[^\s@/?#]+@[^\s@/?#]+\.[^\s@/?#]+$/.test(decodeURIComponent(url.pathname))) return link;
  throw invalid(field, 'Use an https:// link or a mailto: address.');
};

/* Where feedback about Crumb itself goes; only https. */
const httpsLink = () => (value, field) => {
  const link = text({ max: 300, optional: true })(value, field);
  if (!link) return link;
  if (!isHttps(parseUrl(link))) throw invalid(field, 'Use an https:// link.');
  return link;
};

const ORG_PATCH = {
  name: text({ min: 1, max: 80, optional: true }),
  welcome: text({ max: 500, optional: true, multiline: true }),
  locale: oneOf(LOCALES, { optional: true }),
  unitLabel: text({ min: 1, max: 24, optional: true }),
  adminContact: contactLink(),
  feedbackUrl: httpsLink(),
  mode: oneOf(['credit', 'points'], { optional: true }),
  currency: oneOf(CURRENCIES, { optional: true }),
  threshold: amount({ optional: true }),
};

const COLUMN = {
  name: 'name', welcome: 'welcome', locale: 'locale', unitLabel: 'unit_label', adminContact: 'admin_contact',
  feedbackUrl: 'feedback_url', mode: 'mode', currency: 'currency', thresholdUnits: 'threshold_units',
};

/**
 * Owner-only settings. Names, welcome text, language and links can always
 * change. The reward rules — credit or points, currency, unlock threshold —
 * are fixed once the ledger has an entry, and the unit is also fixed once a
 * benefit has a price in it, so nothing already recorded changes meaning.
 */
export function updateOrg(db, actor, patch, clock = () => Date.now()) {
  requireRole(actor, OWNER);
  const fields = readObject(patch, ORG_PATCH);
  return writeTransaction(db, () => {
    const current = freshActor(db, actor, OWNER);
    const row = requireOrg(db);
    const mode = fields.mode ?? row.mode;
    let currency = fields.mode === 'points' ? null : row.currency;
    if (fields.currency !== undefined) {
      if (mode !== 'credit') throw invalid('currency', 'Points do not use a currency.');
      currency = fields.currency;
    }
    if (mode === 'credit' && !currency) throw invalid('currency', 'Choose a currency for credit.');
    let thresholdUnits = row.threshold_units;
    if (fields.threshold !== undefined) thresholdUnits = parseUnits(fields.threshold, mode);
    else if (mode !== row.mode) throw invalid('threshold', 'Set the unlock threshold again when changing between credit and points.');

    const unitChanged = mode !== row.mode || currency !== row.currency;
    if ((unitChanged && (row.has_ledger || row.has_rewards)) || (thresholdUnits !== row.threshold_units && row.has_ledger))
      throw new AppError(409, 'RULES_LOCKED',
        'Reward rules are fixed once rewards are recorded (and the unit once benefits are priced), so earlier amounts keep their meaning.');

    const next = {
      name: fields.name ?? row.name,
      welcome: fields.welcome ?? row.welcome,
      locale: fields.locale ?? row.locale,
      unitLabel: fields.unitLabel ?? row.unit_label,
      adminContact: fields.adminContact ?? row.admin_contact,
      feedbackUrl: fields.feedbackUrl ?? row.feedback_url,
      mode,
      currency,
      thresholdUnits,
    };
    const changed = Object.keys(next).filter(key => next[key] !== row[COLUMN[key]]);
    if (changed.length) {
      const at = new Date(clock()).toISOString();
      db.prepare(`UPDATE organization SET name = @name, welcome = @welcome, locale = @locale, unit_label = @unitLabel,
                    admin_contact = @adminContact, feedback_url = @feedbackUrl, mode = @mode, currency = @currency,
                    threshold_units = @thresholdUnits, updated_at = @at WHERE id = 1`).run({ ...next, at });
      writeAudit(db, { actorId: current.id, action: 'org.update', detail: { changed } }, at);
    }
    return orgView(readOrgRow(db), { signedIn: true });
  });
}

/* ---------------------------------------------------------------- logo */

const MAX_LOGO_BYTES = 1024 * 1024;
const invalidLogo = () => new AppError(422, 'INVALID_LOGO', 'Use a static PNG, JPEG or WebP image up to 2048 pixels on each side.');

/* Checked before any decoder sees the bytes: SVG, HTML and everything else stop here. */
function sniff(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/**
 * Decodes an uploaded logo and returns a fresh PNG of at most 512×512.
 * Only the pixels survive: no metadata, no original bytes, nothing a
 * browser could run. Oversized and multi-frame images are refused.
 */
export async function normalizeLogo(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw invalidLogo();
  if (buffer.length > MAX_LOGO_BYTES) throw new AppError(413, 'LOGO_TOO_LARGE', 'Use an image under 1 MB.');
  const sniffed = sniff(buffer);
  if (!sniffed) throw invalidLogo();
  let meta;
  const image = sharp(buffer, { limitInputPixels: 4194304, animated: false });
  try {
    meta = await image.metadata();
  } catch {
    throw invalidLogo();
  }
  if (meta.format !== sniffed || (meta.pages ?? 1) !== 1 || !meta.width || !meta.height || meta.width > 2048 || meta.height > 2048)
    throw invalidLogo();
  try {
    return await image.rotate().resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  } catch {
    throw invalidLogo();
  }
}

export function setLogo(db, actor, png, clock = () => Date.now()) {
  requireRole(actor, OWNER);
  writeTransaction(db, () => {
    const current = freshActor(db, actor, OWNER);
    const at = new Date(clock()).toISOString();
    db.prepare('UPDATE organization SET logo_png = ?, updated_at = ? WHERE id = 1').run(png, at);
    writeAudit(db, { actorId: current.id, action: 'org.logo_update', detail: { bytes: png.length } }, at);
  });
}

export function removeLogo(db, actor, clock = () => Date.now()) {
  requireRole(actor, OWNER);
  writeTransaction(db, () => {
    const current = freshActor(db, actor, OWNER);
    const at = new Date(clock()).toISOString();
    db.prepare('UPDATE organization SET logo_png = NULL, updated_at = ? WHERE id = 1').run(at);
    writeAudit(db, { actorId: current.id, action: 'org.logo_remove' }, at);
  });
}

export const readLogo = db => db.prepare('SELECT logo_png FROM organization WHERE id = 1').get()?.logo_png ?? null;
