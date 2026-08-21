import { describe, it, expect } from 'vitest';
import { countryFromMarket } from '@/components/ClubContactPicker';

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
