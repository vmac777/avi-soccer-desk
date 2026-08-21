/**
 * Markets are stored as "Country – League": "Brazil – Série A", "Argentina -
 * LPF". One string doing two jobs, because that is how the contact book was
 * seeded and every screen since has read it that way.
 */

/**
 * The country half of a market string.
 *
 * Splits on a hyphen *with spaces around it*, which is the whole trick:
 * "Bosnia-Herzegovina - Premijer Liga" has to yield the country intact rather
 * than "Bosnia". Both the ASCII hyphen and the en dash appear in the data.
 */
export function countryFromMarket(market?: string | null): string {
  if (!market) return '';
  const [country] = market.split(/\s+[-–]\s+/);
  return (country ?? '').trim();
}

/** What a need with no resolvable country is filed under. */
export const NO_COUNTRY = 'Unattributed';

/**
 * Group anything by country, alphabetically, with the unattributed last.
 *
 * Sinking `Unattributed` matters: it is a data gap, not a market, and sorted
 * plainly it would land between Turkey and USA as though it were somewhere you
 * could ring. Everything else sorts by name so an agent can find a market
 * without reading the whole page.
 */
export function groupByCountry<T>(
  items: T[],
  countryOf: (item: T) => string,
): [string, T[]][] {
  const groups: Record<string, T[]> = {};
  items.forEach((item) => {
    (groups[countryOf(item) || NO_COUNTRY] ||= []).push(item);
  });
  return Object.entries(groups).sort(([a], [b]) => {
    if (a === NO_COUNTRY) return 1;
    if (b === NO_COUNTRY) return -1;
    return a.localeCompare(b);
  });
}
