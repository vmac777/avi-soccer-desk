import tmData from '@/data/t1_club_tm_lookup.json';

const CLUBS: Record<string, { tm: string; tmTopTransfers: string }> = tmData.clubs;
const ALIASES: Record<string, string> = tmData.aliases;

const SUFFIXES = /\s+(FC|AFC|SC|CF|SFC|AC|BC|EC|FK)$/i;

function normalizeClubName(name: string): string {
  return name.replace(/…/g, '...').replace(/\s+/g, ' ').trim();
}

function stripSuffix(name: string): string {
  return name.replace(SUFFIXES, '').trim();
}

/**
 * Resolve TM links for a club name. Three-step fallback:
 * 1. Exact match in clubs
 * 2. Alias match
 * 3. Suffix-stripped retry of steps 1 & 2
 */
export function getClubTmLinks(clubName: string): { tm: string; tmTopTransfers: string } | null {
  const normalizedName = normalizeClubName(clubName);

  // 1. Exact match
  if (CLUBS[normalizedName]) return CLUBS[normalizedName];

  // 2. Alias match
  const aliased = ALIASES[normalizedName];
  if (aliased && CLUBS[aliased]) return CLUBS[aliased];

  // 3. Strip suffix and retry
  const stripped = stripSuffix(normalizedName);
  if (stripped !== normalizedName) {
    if (CLUBS[stripped]) return CLUBS[stripped];
    const aliasedStripped = ALIASES[stripped];
    if (aliasedStripped && CLUBS[aliasedStripped]) return CLUBS[aliasedStripped];
  }

  return null;
}
