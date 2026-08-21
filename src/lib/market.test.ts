import { describe, it, expect } from 'vitest';
import { countryFromMarket, groupByCountry, NO_COUNTRY } from '@/lib/market';

// The picker's first step is the country. Getting this wrong scatters one
// country's clubs across several entries — the flat list it replaced.

describe('countryFromMarket', () => {
  it('takes the country off the front', () => {
    expect(countryFromMarket('Argentina - LPF')).toBe('Argentina');
    expect(countryFromMarket('Germany - Bundesliga')).toBe('Germany');
  });

  it('handles an en dash, which the directory also uses', () => {
    expect(countryFromMarket('Brazil – Série A')).toBe('Brazil');
  });

  it('leaves a league with a hyphen in its country name alone', () => {
    // Splitting on a bare hyphen would cut "Bosnia-Herzegovina" in half.
    expect(countryFromMarket('Bosnia-Herzegovina - Premijer Liga')).toBe('Bosnia-Herzegovina');
  });

  it('is quiet about nothing', () => {
    expect(countryFromMarket(undefined)).toBe('');
    expect(countryFromMarket('')).toBe('');
  });
});

describe('groupByCountry', () => {
  const need = (club: string, country: string) => ({ club, country });
  const by = (n: { country: string }) => n.country;

  it('groups and sorts markets alphabetically', () => {
    const out = groupByCountry(
      [need('Porto', 'Portugal'), need('Flamengo', 'Brazil'), need('Benfica', 'Portugal')],
      by,
    );
    expect(out.map(([c]) => c)).toEqual(['Brazil', 'Portugal']);
    expect(out[1][1]).toHaveLength(2);
  });

  it('sinks the unattributed below every real market', () => {
    // A data gap is not somewhere you can ring, so it must not sort between
    // Turkey and USA as though it were.
    const out = groupByCountry(
      [need('?', NO_COUNTRY), need('Galatasaray', 'Turkey'), need('LAFC', 'USA')],
      by,
    );
    expect(out.map(([c]) => c)).toEqual(['Turkey', 'USA', NO_COUNTRY]);
  });

  it('files an empty country under unattributed rather than under ""', () => {
    const out = groupByCountry([need('Somewhere', '')], by);
    expect(out).toEqual([[NO_COUNTRY, [{ club: 'Somewhere', country: '' }]]]);
  });

  it('is empty for no items', () => {
    expect(groupByCountry([], by)).toEqual([]);
  });
});
