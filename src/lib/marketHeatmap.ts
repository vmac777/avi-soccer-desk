import type { ContactEnriched } from '@/lib/supabase';
import type { Club } from '@/hooks/useClubsAndSources';

/**
 * Every club in a league, and how warm each one is.
 *
 * This used to group the league's *contacts* by club name, which answers a
 * different question — how many clubs we happen to hold a contact for — and got
 * it wrong in both directions. Leagues we have barely touched read as tiny
 * (Qatar showed 2), while a club filed under two spellings in the contact book
 * counted twice, so England read 23 against a 20-club league.
 *
 * The `clubs` table is the authority on who is in a league. Contacts only say
 * how recently we spoke to them. A club with no contact at all is not missing
 * from the league — it is the gap in the network, and it belongs on this tile.
 */
export function getTeamFreshness(
  contacts: ContactEnriched[],
  leagueClubs: string[],
): { club: string; health: string }[] {
  const byClub: Record<string, ContactEnriched[]> = {};
  contacts.forEach((c) => {
    if (!c.club) return;
    if (!byClub[c.club]) byClub[c.club] = [];
    byClub[c.club].push(c);
  });

  // Fall back to the contact book only where the clubs table holds nothing for
  // this league — better a rough count than an empty tile.
  const names = leagueClubs.length > 0 ? leagueClubs : Object.keys(byClub);

  return names.map((club) => {
    const members = byClub[club] ?? [];
    if (members.length === 0) return { club, health: 'unknown' };
    const best = members.reduce((a, b) => {
      const da = a.days_since_contact ?? 9999;
      const db = b.days_since_contact ?? 9999;
      return da < db ? a : b;
    });
    return { club, health: best.health_status };
  }).sort((a, b) => a.club.localeCompare(b.club));
}

/**
 * League → the clubs in it, from the clubs table.
 *
 * Rows without a league or a name are dropped rather than bucketed under an
 * empty key, which would show up as a nameless league tile.
 */
export function clubsByLeagueFrom(clubs: Club[]): Record<string, string[]> {
  const m: Record<string, string[]> = {};
  clubs.forEach((c) => {
    if (!c.league || !c.name) return;
    (m[c.league] ||= []).push(c.name);
  });
  return m;
}
