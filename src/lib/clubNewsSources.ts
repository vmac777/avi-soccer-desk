import newsData from '@/data/pl_news_sources.json';

const CLUBS: Record<string, { skySports: string; bbc: string; espn: string }> = newsData.clubs;
const ALIASES: Record<string, string> = newsData.aliases;

const SUFFIXES = /\s+(FC|AFC|SC|CF|SFC|AC|BC|EC|FK)$/i;

function stripSuffix(name: string): string {
  return name.replace(SUFFIXES, '').trim();
}

export function resolveClubNews(clubName: string): { skySports: string; bbc: string; espn: string } | null {
  if (CLUBS[clubName]) return CLUBS[clubName];

  const aliased = ALIASES[clubName];
  if (aliased && CLUBS[aliased]) return CLUBS[aliased];

  const stripped = stripSuffix(clubName);
  if (stripped !== clubName) {
    if (CLUBS[stripped]) return CLUBS[stripped];
    const aliasedStripped = ALIASES[stripped];
    if (aliasedStripped && CLUBS[aliasedStripped]) return CLUBS[aliasedStripped];
  }

  return null;
}
