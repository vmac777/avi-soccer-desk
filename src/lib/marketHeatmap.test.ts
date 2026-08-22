import { describe, it, expect } from 'vitest';
import { getTeamFreshness, clubsByLeagueFrom } from './marketHeatmap';
import type { ContactEnriched } from '@/lib/supabase';
import type { Club } from '@/hooks/useClubsAndSources';

/**
 * The dashboard tile counted distinct club names in the contact book, which is
 * a different question from "how many clubs are in this league" and got it
 * wrong in both directions at once — Qatar read 2, England read 23. These pin
 * both directions.
 */

const contact = (club: string, days: number | null, health: string): ContactEnriched =>
  ({ club, days_since_contact: days, health_status: health }) as ContactEnriched;

const club = (name: string, league: string | null): Club =>
  ({ id: name, name, league, country: null, tier: null, crest_url: null });

describe('getTeamFreshness', () => {
  it('counts the league, not the contact book', () => {
    // Twelve clubs in the league, two of which we know somebody at.
    const league = Array.from({ length: 12 }, (_, i) => `Club ${i + 1}`);
    const contacts = [contact('Club 1', 4, 'active'), contact('Club 2', 200, 'stale')];

    const teams = getTeamFreshness(contacts, league);

    expect(teams).toHaveLength(12);
    expect(teams.filter(t => t.health === 'unknown')).toHaveLength(10);
  });

  it('does not let a club spelled two ways count twice', () => {
    const contacts = [
      contact('Manchester United', 10, 'active'),
      contact('Man Utd', 20, 'active'), // same club, filed differently
    ];

    const teams = getTeamFreshness(contacts, ['Manchester United', 'Liverpool']);

    expect(teams.map(t => t.club)).toEqual(['Liverpool', 'Manchester United']);
  });

  it('takes the warmest contact at a club as that club’s health', () => {
    const contacts = [
      contact('Palmeiras', 300, 'stale'),
      contact('Palmeiras', 3, 'active'),
    ];
    const [only] = getTeamFreshness(contacts, ['Palmeiras']);
    expect(only.health).toBe('active');
  });

  it('reads a club with no contact as uncontacted, not as absent', () => {
    const teams = getTeamFreshness([], ['Al Sadd', 'Al Duhail']);
    expect(teams).toHaveLength(2);
    expect(teams.every(t => t.health === 'unknown')).toBe(true);
  });

  it('falls back to the contact book when the clubs table has nothing', () => {
    const teams = getTeamFreshness([contact('Some Club', 5, 'active')], []);
    expect(teams).toEqual([{ club: 'Some Club', health: 'active' }]);
  });

  it('ignores a contact with no club rather than bucketing it under ""', () => {
    const teams = getTeamFreshness([contact('', 5, 'active')], []);
    expect(teams).toEqual([]);
  });
});

describe('clubsByLeagueFrom', () => {
  it('groups by league and drops rows with no league', () => {
    const map = clubsByLeagueFrom([
      club('Flamengo', 'Brazil – Série A'),
      club('Palmeiras', 'Brazil – Série A'),
      club('Arsenal', 'England – Premier League'),
      club('Nowhere FC', null),
    ]);
    expect(map['Brazil – Série A']).toEqual(['Flamengo', 'Palmeiras']);
    expect(map['England – Premier League']).toEqual(['Arsenal']);
    expect(Object.keys(map)).toHaveLength(2);
  });
});
