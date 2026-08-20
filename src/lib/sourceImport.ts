import * as XLSX from 'xlsx';
import Fuse from 'fuse.js';

export type ParsedSource = { rawUrl: string; rawLabel: string | null };
export type ParsedClubBucket = { urls: ParsedSource[] };
export type LeagueImport = {
  sheetName: string;
  clubs: Record<string, ParsedClubBucket>;
};
export type ParsedImport = {
  leagues: LeagueImport[];
  skippedSheets: string[];
};

export type ClubRow = { id: string; name: string; league: string | null; tier: number | null };

export type SourceRow = { club_id: string; url: string };

export type PreviewSourceItem = {
  sheetName: string;
  rawClubName: string;
  matchedClubId: string | null;
  matchedClubName: string | null;
  matchScore: number | null; // 0-100, where 100 is exact
  matchTier: 'exact' | 'high' | 'mid' | 'low' | 'none';
  rawUrl: string;
  normalizedUrl: string;
  label: string;
  upgradedFromHttp: boolean;
  status: 'ready' | 'duplicate' | 'invalid_url' | 'needs_review' | 'unmatched' | 'unknown_league';
  reviewCandidates?: { clubId: string; clubName: string; score: number }[];
  invalidReason?: string;
};

export type PreviewSummary = {
  ready: number;
  needsReview: number;
  invalid: number;
  duplicates: number;
  unmatched: number;
  byLeague: Record<string, { ready: number; needsReview: number; invalid: number; duplicates: number; unmatched: number }>;
  skippedSheets: string[];
  unknownLeagues: string[];
};

export const DOMAIN_LABELS: Record<string, string> = {
  'ge.globo.com': 'Globo Esporte',
  'uol.com.br': 'UOL Esporte',
  'lance.com.br': 'Lance',
  'skysports.com': 'Sky Sports',
  'bbc.com': 'BBC Sport',
  'bbc.co.uk': 'BBC Sport',
  'espn.com': 'ESPN',
  'espndeportes.espn.com': 'ESPN Deportes',
  'espn.com.mx': 'ESPN México',
  'theathletic.com': 'The Athletic',
  'nytimes.com': 'The Athletic',
  'marca.com': 'Marca',
  'as.com': 'AS',
  'mundodeportivo.com': 'Mundo Deportivo',
  'gazzetta.it': 'La Gazzetta dello Sport',
  'corrieredellosport.it': 'Corriere dello Sport',
  'gianlucadimarzio.com': 'Di Marzio',
  'kicker.de': 'Kicker',
  'bild.de': 'Bild',
  'sport1.de': 'Sport1',
  'lequipe.fr': "L'Équipe",
  'rmcsport.bfmtv.com': 'RMC Sport',
  'footmercato.net': 'Foot Mercato',
  'abola.pt': 'A Bola',
  'record.pt': 'Record',
  'ojogo.pt': 'O Jogo',
  'record.com.mx': 'Récord',
  'mediotiempo.com': 'Mediotiempo',
  'fanatik.com.tr': 'Fanatik',
  'fotomac.com.tr': 'Fotomaç',
  'arabnews.com': 'Arab News',
  'spl.com.sa': 'Saudi Pro League',
  'mlssoccer.com': 'MLS Soccer',
};

export function normalizeName(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function generateLabel(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (DOMAIN_LABELS[host]) return DOMAIN_LABELS[host];
    const firstSegment = host.split('.')[0];
    return firstSegment.charAt(0).toUpperCase() + firstSegment.slice(1);
  } catch {
    return 'Source';
  }
}

export async function parseXlsx(file: File): Promise<ParsedImport> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });

  const leagues: LeagueImport[] = [];
  const skippedSheets: string[] = [];

  for (const sheetName of wb.SheetNames) {
    if (sheetName === 'Instructions') {
      skippedSheets.push(sheetName);
      continue;
    }
    if (sheetName.toLowerCase().startsWith('sheet')) {
      skippedSheets.push(sheetName);
      continue;
    }

    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<any>(sheet, { header: 1, defval: null });

    const headerIdx = rows.findIndex((r) => r && r[0] === 'club_name');
    if (headerIdx === -1) {
      skippedSheets.push(sheetName);
      continue;
    }

    const dataRows = rows.slice(headerIdx + 1);
    let currentClub: string | null = null;
    const clubs: Record<string, ParsedClubBucket> = {};

    for (const row of dataRows) {
      if (!row) continue;
      const [clubName, url] = row;

      if (clubName && typeof clubName === 'string' && clubName.trim()) {
        currentClub = clubName.trim();
        if (!clubs[currentClub]) clubs[currentClub] = { urls: [] };
      }

      if (url && typeof url === 'string' && url.trim() && currentClub) {
        clubs[currentClub].urls.push({
          rawUrl: url.trim(),
          rawLabel: row[2]?.toString().trim() || null,
        });
      }
    }

    leagues.push({ sheetName, clubs });
  }

  return { leagues, skippedSheets };
}

function normalizeUrl(rawUrl: string): { url: string; valid: boolean; upgraded: boolean } {
  const trimmed = rawUrl.trim();
  if (!/^https?:\/\/.+/i.test(trimmed)) {
    return { url: trimmed, valid: false, upgraded: false };
  }
  let url = trimmed;
  let upgraded = false;
  if (/^http:\/\//i.test(url)) {
    url = url.replace(/^http:\/\//i, 'https://');
    upgraded = true;
  }
  try {
    new URL(url);
    return { url, valid: true, upgraded };
  } catch {
    return { url: trimmed, valid: false, upgraded: false };
  }
}

export function buildPreview(
  parsed: ParsedImport,
  clubs: ClubRow[],
  existingSources: SourceRow[]
): { items: PreviewSourceItem[]; summary: PreviewSummary } {
  const items: PreviewSourceItem[] = [];
  const dupKey = new Set(existingSources.map((s) => `${s.club_id}::${s.url}`));
  const newKey = new Set<string>(); // dedupe within import

  // Group clubs by league for scoped fuzzy matching
  const clubsByLeague: Record<string, ClubRow[]> = {};
  for (const c of clubs) {
    const key = c.league || '__none__';
    if (!clubsByLeague[key]) clubsByLeague[key] = [];
    clubsByLeague[key].push(c);
  }

  const unknownLeagues = new Set<string>();

  const summary: PreviewSummary = {
    ready: 0,
    needsReview: 0,
    invalid: 0,
    duplicates: 0,
    unmatched: 0,
    byLeague: {},
    skippedSheets: parsed.skippedSheets,
    unknownLeagues: [],
  };

  for (const league of parsed.leagues) {
    const sheet = league.sheetName;
    summary.byLeague[sheet] = { ready: 0, needsReview: 0, invalid: 0, duplicates: 0, unmatched: 0 };

    const candidates = clubsByLeague[sheet] || [];
    if (candidates.length === 0) {
      unknownLeagues.add(sheet);
    }

    const fuse = candidates.length
      ? new Fuse(candidates, {
          keys: ['name'],
          includeScore: true,
          threshold: 0.4,
          getFn: (obj: any, path: any) => normalizeName(String(obj[path as string] ?? '')),
        })
      : null;

    const exactByNorm = new Map<string, ClubRow>();
    for (const c of candidates) exactByNorm.set(normalizeName(c.name), c);

    for (const [rawClubName, bucket] of Object.entries(league.clubs)) {
      const normRaw = normalizeName(rawClubName);
      const exact = exactByNorm.get(normRaw);

      let matchedClubId: string | null = null;
      let matchedClubName: string | null = null;
      let matchScore: number | null = null;
      let matchTier: PreviewSourceItem['matchTier'] = 'none';
      let reviewCandidates: { clubId: string; clubName: string; score: number }[] | undefined;

      if (exact) {
        matchedClubId = exact.id;
        matchedClubName = exact.name;
        matchScore = 100;
        matchTier = 'exact';
      } else if (fuse) {
        const results = fuse.search(normalizeName(rawClubName)).slice(0, 3);
        if (results.length > 0) {
          const best = results[0];
          // fuse score: 0 = perfect, 1 = no match. Convert to 0-100 (higher = better)
          const score = Math.round((1 - (best.score ?? 1)) * 100);
          if (score >= 95) {
            matchedClubId = best.item.id;
            matchedClubName = best.item.name;
            matchScore = score;
            matchTier = 'high';
          } else if (score >= 90) {
            matchedClubId = best.item.id;
            matchedClubName = best.item.name;
            matchScore = score;
            matchTier = 'mid';
          } else if (score >= 85) {
            matchScore = score;
            matchTier = 'low';
            reviewCandidates = results.map((r) => ({
              clubId: r.item.id,
              clubName: r.item.name,
              score: Math.round((1 - (r.score ?? 1)) * 100),
            }));
          } else {
            matchScore = score;
            matchTier = 'none';
          }
        }
      }

      for (const src of bucket.urls) {
        const { url, valid, upgraded } = normalizeUrl(src.rawUrl);
        const label = src.rawLabel || (valid ? generateLabel(url) : 'Source');

        const base: Omit<PreviewSourceItem, 'status'> = {
          sheetName: sheet,
          rawClubName,
          matchedClubId,
          matchedClubName,
          matchScore,
          matchTier,
          rawUrl: src.rawUrl,
          normalizedUrl: url,
          label,
          upgradedFromHttp: upgraded,
          reviewCandidates,
        };

        if (unknownLeagues.has(sheet)) {
          items.push({ ...base, status: 'unknown_league' });
          summary.unmatched++;
          summary.byLeague[sheet].unmatched++;
          continue;
        }
        if (!valid) {
          items.push({ ...base, status: 'invalid_url', invalidReason: 'Bad URL format' });
          summary.invalid++;
          summary.byLeague[sheet].invalid++;
          continue;
        }
        if (matchTier === 'low') {
          items.push({ ...base, status: 'needs_review' });
          summary.needsReview++;
          summary.byLeague[sheet].needsReview++;
          continue;
        }
        if (matchTier === 'none' || !matchedClubId) {
          items.push({ ...base, status: 'unmatched' });
          summary.unmatched++;
          summary.byLeague[sheet].unmatched++;
          continue;
        }

        const dKey = `${matchedClubId}::${url}`;
        if (dupKey.has(dKey) || newKey.has(dKey)) {
          items.push({ ...base, status: 'duplicate' });
          summary.duplicates++;
          summary.byLeague[sheet].duplicates++;
          continue;
        }
        newKey.add(dKey);
        items.push({ ...base, status: 'ready' });
        summary.ready++;
        summary.byLeague[sheet].ready++;
      }
    }
  }

  summary.unknownLeagues = Array.from(unknownLeagues);
  return { items, summary };
}
