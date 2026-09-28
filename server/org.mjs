import { AppError } from './errors.mjs';
import { parseUnits } from './units.mjs';
import { amount, invalid, oneOf, readObject, text } from './validate.mjs';

export const CURRENCIES = ['CAD', 'USD', 'CNY'];
export const LOCALES = ['en', 'zh-CN'];

const ORG_COLUMNS = `name, mode, currency, unit_label, threshold_units, locale, welcome,
  admin_contact, feedback_url, (logo_png IS NOT NULL) AS has_logo`;

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
