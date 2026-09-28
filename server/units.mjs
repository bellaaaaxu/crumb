import { AppError } from './errors.mjs';
export { formatUnits, unitsToInput } from '../app/format.js';

/* Single grants, balances and lifetime totals all stay at or below this. */
export const MAX_UNITS = 1_000_000_000_000;

/**
 * Turns an amount typed by a person into integer units.
 * Credit accepts up to two decimal places ("12.50" -> 1250 cents);
 * points accept whole numbers only. Numbers from JSON are refused on purpose:
 * a float has already lost the exact value by the time it arrives.
 */
export function parseUnits(value, mode) {
  if (!['credit', 'points'].includes(mode))
    throw new AppError(422, 'INVALID_MODE', 'Select credit or points.');
  const pattern = mode === 'credit' ? /^\d+(?:\.\d{1,2})?$/ : /^\d+$/;
  if (typeof value !== 'string' || value.length > 32 || !pattern.test(value))
    throw new AppError(422, 'INVALID_AMOUNT', 'Enter a valid positive amount.');
  const [whole, fraction = ''] = value.split('.');
  const units = mode === 'credit'
    ? BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')) : BigInt(whole);
  if (units < 1n || units > BigInt(MAX_UNITS))
    throw new AppError(422, 'INVALID_AMOUNT', 'Amount is outside the supported range.');
  return Number(units);
}

/* For values that are already units (domain calls, database rows). */
export function assertUnits(units) {
  if (!Number.isSafeInteger(units) || units < 1 || units > MAX_UNITS)
    throw new AppError(422, 'INVALID_AMOUNT', 'Amount is outside the supported range.');
  return units;
}

/**
 * "12" is 1200 cents as credit but 12 as points. Called inside the write
 * transaction with the mode the amount was read in, so a change of rules that
 * commits first makes the write fail instead of storing a misread amount.
 */
export function assertSameMode(db, mode) {
  if (mode === undefined) return;
  if (db.prepare('SELECT mode FROM organization WHERE id = 1').get()?.mode !== mode)
    throw new AppError(409, 'RULES_CHANGED',
      'The reward rules changed while this was being entered. Reload the page and enter the amount again.');
}
