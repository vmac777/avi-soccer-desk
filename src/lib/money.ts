/**
 * Typing money without losing your place.
 *
 * A field labelled "FEE CEILING (€M)" invites two readings, and both get typed:
 * `4` meaning four million, and `4000000` meaning the same thing. One of them
 * is off by a factor of a million, and nothing on screen says which you did —
 * a real entry read `100000` in a €M field, which is a hundred billion euros.
 *
 * So the unit comes out of the label, the field takes plain euros, digits group
 * as you type, and the magnitude is echoed underneath in words an agent uses.
 * You cannot mis-key €100bn without the line below saying "€100.0bn".
 */

/** Strip everything that is not a digit, so a pasted "€4,000,000" still works. */
export const digitsOnly = (s: string): string => s.replace(/\D/g, '');

/**
 * "4000000" → "4,000,000".
 *
 * Commas rather than the browser's locale grouping: a machine set to de-DE
 * would render dots, which in a money field reads as a decimal point.
 */
export function groupDigits(digits: string): string {
  const clean = digitsOnly(digits).replace(/^0+(?=\d)/, '');
  return clean.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Null for an empty field, not zero.
 *
 * A club that never mentioned a ceiling has no ceiling; storing 0 would tell
 * the scorer they will not pay anything, and quietly drop every player.
 */
export function parseMoney(s: string): number | null {
  const clean = digitsOnly(s);
  if (clean === '') return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

/**
 * The magnitude, said the way it is said out loud: €4.0m, €850k, €250.
 *
 * Rounding is chosen so nothing reads as a wrong order of magnitude — 999,600
 * rounds to 1000k, which is a million, so it steps up rather than printing
 * "€1,000k".
 */
export function formatMoneyShort(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';

  if (abs >= 1_000_000_000) return `${sign}€${(abs / 1_000_000_000).toFixed(1)}bn`;
  if (abs >= 1_000_000) return `${sign}€${(abs / 1_000_000).toFixed(1)}m`;

  const k = Math.round(abs / 1_000);
  if (k >= 1_000) return `${sign}€${(abs / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `${sign}€${k}k`;

  return `${sign}€${Math.round(abs)}`;
}
