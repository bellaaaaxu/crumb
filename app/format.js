/* Display formatting for reward units, shared by the browser and the server.
 *
 * Units are always safe integers: cents in credit mode, whole points in points
 * mode. Formatting splits the integer as text and hands Intl a decimal string,
 * so nothing here ever does arithmetic on a fractional number. */

export function formatUnits(units, org, locale) {
  if (!Number.isSafeInteger(units)) throw new TypeError('units must be a safe integer');
  const sign = units < 0 ? '-' : '';
  const abs = Math.abs(units);
  if (org.mode === 'credit') {
    const cents = abs % 100;
    const whole = (abs - cents) / 100;
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: org.currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(`${sign}${whole}.${String(cents).padStart(2, '0')}`);
  }
  const count = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(`${sign}${abs}`);
  return `${count} ${org.unitLabel}`;
}

/* The plain decimal an input field should show for a value, e.g. 1250 -> "12.50". */
export function unitsToInput(units, mode) {
  if (mode !== 'credit') return String(units);
  const cents = units % 100;
  return `${(units - cents) / 100}.${String(cents).padStart(2, '0')}`;
}
