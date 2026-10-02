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

/* The same rules as the server's parseUnits, for checking a form before it
 * is sent: "12.50" (or "12,50") -> 1250 in credit mode, "100" -> 100 in
 * points mode, and null for anything the unit cannot hold. The server still decides. */
export function amountToUnits(value, mode) {
  const pattern = mode === 'credit' ? /^\d+(?:[.,]\d{1,2})?$/ : /^\d+$/;
  if (typeof value !== 'string' || value.length > 32 || !pattern.test(value)) return null;
  const [whole, fraction = ''] = value.split(/[.,]/);
  const units = mode === 'credit' ? BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')) : BigInt(whole);
  return units >= 1n && units <= 1_000_000_000_000n ? Number(units) : null;
}

/* The plain decimal an input field should show for a value, e.g. 1250 -> "12.50". */
export function unitsToInput(units, mode) {
  if (mode !== 'credit') return String(units);
  const cents = units % 100;
  return `${(units - cents) / 100}.${String(cents).padStart(2, '0')}`;
}

/* Whether a benefit the member cannot afford yet is close enough for "Almost there": short
 * by more than nothing and by at most half its price. A bigger gap gets no line, since
 * "a little more" would not be true. The half is compared as gap * 2 <= price, so an odd
 * price is never rounded either way; both sides stay well inside a safe integer. */
export function isAlmostThere(availableUnits, costUnits) {
  const gap = costUnits - availableUnits;
  return gap > 0 && gap * 2 <= costUnits;
}
