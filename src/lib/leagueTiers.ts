export const TIER_1_LEAGUES = [
  'Brazil - Série A',
  'England - Premier League',
  'France - Ligue 1',
  'Germany - Bundesliga',
  'Italy - Serie A',
  'Mexico - Liga MX',
  'Portugal - Primeira Liga',
  'Qatar - Stars League',
  'Russia - Premier Liga',
  'Saudi Arabia - Pro League',
  'Spain - La Liga',
  'Turkey - Süper Lig',
  'UAE - Pro League',
  'USA - MLS',
];

export const TIER_2_LEAGUES = [
  'Argentina - LPF',
  'Austria - Bundesliga',
  'Belgium - Pro League',
  'Brazil - Série B',
  'Bulgaria - First League',
  'Croatia - HNL',
  'Denmark - Superliga',
  'England - Championship',
  'Greece - Super League',
  'Japan - J1 League',
  'Netherlands - Eredivisie',
  'Portugal - Liga 2',
  'Scotland - Premiership',
];

export function getLeagueTier(league: string): number {
  if (TIER_1_LEAGUES.includes(league)) return 1;
  if (TIER_2_LEAGUES.includes(league)) return 2;
  return 3;
}
