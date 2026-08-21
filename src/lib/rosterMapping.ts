import type { ScoutedTarget } from '@/hooks/useBuyData';
import type {
  RosterPlayer,
  DataProvenance,
  XtvHistoryEntry,
  TransferHistoryEntry,
} from '@/lib/rosterData';

/**
 * Map a `scouted_targets` row onto the shape the dossier components read.
 *
 * The table is snake_case and carries raw TransferRoom payloads; the components
 * were written against a camelCase player object. This is the single place that
 * translation happens, so a column rename only has to be handled once.
 *
 * Nothing is invented here. A field the row does not have stays undefined, and
 * `dataProvenance` decides whether what is present may be printed on a document
 * or used to match against a club's requirements.
 */

/** TransferRoom's payload is untyped jsonb; read defensively. */
function readTr(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

/**
 * Look a field up regardless of how it is spelled.
 *
 * `tr_data` is TransferRoom's own response, stored verbatim, and it is
 * PascalCase: `XTV`, `GBEScore`, `PreferredFoot`, `TransferHistory`. This file
 * originally read camelCase and snake_case only, so every one of those came back
 * undefined — which is why a player could carry a valuation, a GBE score and a
 * transfer history and still show an empty dossier.
 *
 * Rather than guess at each field's casing, flatten the keys: strip separators,
 * lowercase, and match on that. `xtvChange6m`, `XTVChange6M` and `xtv_change_6m`
 * all collapse to the same lookup.
 */
const flatten = (k: string) => k.replace(/[^a-z0-9]/gi, '').toLowerCase();

function field(tr: Record<string, unknown>, ...names: string[]): unknown {
  const index = new Map<string, unknown>();
  for (const [k, v] of Object.entries(tr)) index.set(flatten(k), v);
  for (const n of names) {
    const v = index.get(flatten(n));
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v : undefined;

function xtvHistoryFrom(tr: Record<string, unknown>): XtvHistoryEntry[] {
  const raw = field(tr, 'xtvHistory', 'xTVHistory', 'valuationHistory');
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e) => {
      const o = readTr(e);
      const year = num(field(o, 'year')), month = num(field(o, 'month'));
      const xtv = num(field(o, 'xtv', 'value', 'expectedTransferValue'));
      return year && month && xtv != null ? { year, month, xtv } : null;
    })
    .filter((e): e is XtvHistoryEntry => e !== null);
}

function transferHistoryFrom(tr: Record<string, unknown>): TransferHistoryEntry[] {
  const raw = field(tr, 'transferHistory', 'transfers');
  if (!Array.isArray(raw)) return [];
  return raw.map((e) => {
    const o = readTr(e);
    return {
      fromTeam: str(field(o, 'fromTeam', 'fromClub', 'sellingTeam')) ?? '',
      toTeam: str(field(o, 'toTeam', 'toClub', 'buyingTeam')) ?? '',
      date: str(field(o, 'date', 'transferDate')) ?? '',
      fee: num(field(o, 'fee', 'transferFee')) ?? null,
      feeEurM: num(field(o, 'feeEurM')) ?? null,
      transferType: str(field(o, 'transferType', 'type')) ?? '',
    };
  });
}

export function toRosterPlayer(row: ScoutedTarget): RosterPlayer {
  const tr = readTr(row.tr_data);

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    position: row.position ?? '',
    dob: row.date_of_birth ?? undefined,
    age: row.age ?? undefined,
    nationality: row.nationality || undefined,
    height: row.height || undefined,
    foot: row.foot || undefined,

    currentClub: row.current_club || undefined,
    league: row.league || undefined,
    contractEndDate: row.contract_end ?? undefined,
    photoUrl: row.photo_url || undefined,
    tmLink: row.tm_link || undefined,
    videoUrl: (row as { video_url?: string | null }).video_url || undefined,
    valuationUrl: row.valuation_url || undefined,

    // Loan: two clubs, two contracts. `currentClub` above is who he plays for.
    tenure: row.tenure ?? undefined,
    ownerClub: row.owner_club || undefined,
    ownerLeague: row.owner_league || undefined,
    loanClub: row.loan_club || undefined,
    loanLeague: row.loan_league || undefined,
    loanContractEnd: row.loan_contract_end ?? undefined,

    // Mandate terms, if we hold them.
    mandateStart: (row as { mandate_start?: string | null }).mandate_start ?? undefined,
    mandateEnd: (row as { mandate_end?: string | null }).mandate_end ?? undefined,
    exclusive: (row as { exclusive?: boolean | null }).exclusive ?? undefined,
    commissionPct: (row as { commission_pct?: number | null }).commission_pct ?? undefined,
    sellOnPct: (row as { sell_on_pct?: number | null }).sell_on_pct ?? undefined,

    marketValue: row.market_value ?? undefined,
    salaryEstimate: row.salary_estimate ?? undefined,
    notes: row.notes || undefined,
    priorityRanking: row.priority_ranking || undefined,

    // TransferRoom
    trId: row.tr_player_id ?? undefined,
    trXtv: row.xtv ?? undefined,
    trXtvChange6m: num(field(tr, 'xtvChange6m', 'xtvChange6Months')),
    trXtvChange12m: num(field(tr, 'xtvChange12m', 'xtvChange12Months')),
    trBaseValue: num(field(tr, 'baseValue')),
    trSellOnPct: num(field(tr, 'sellOnPct', 'sellOnPercentage')),
    trAgency: str(field(tr, 'agency', 'agencyName')),
    trAgencyVerified: str(field(tr, 'agencyVerified')),
    trEstSalaryLow: num(field(tr, 'estSalaryLow', 'salaryLow')),
    trEstSalaryHigh: num(field(tr, 'estSalaryHigh', 'salaryHigh')),
    trGbeScore: num(row.gbe_score) ?? num(field(tr, 'gbeScore', 'GBEScore', 'gbe')),
    trGbeResult: str(field(tr, 'gbeResult', 'GBEResult', 'gbeStatus')),
    trPlayingStyle: str(field(tr, 'playingStyle')),
    trSecondPosition: str(field(tr, 'secondPosition')),
    trInjuryRisk: str(field(tr, 'injuryRisk')),
    trAvailableForSale: row.tr_availability || undefined,
    trAskingPrice: row.tr_asking_price ?? undefined,
    trRating: num(field(tr, 'rating')),
    trPotential: num(field(tr, 'potential')),
    trEuPassport: field(tr, 'euPassport', 'hasEUPassport') === true,
    trPreferredFoot: str(field(tr, 'preferredFoot', 'foot')) ?? row.foot ?? undefined,
    trRecentMinsPct: num(field(tr, 'recentMinsPct', 'recentMinutesPercentage')),
    trGbeIntAppPts: num(field(tr, 'gbeIntAppPts', 'GBEInternationalAppearancePoints')),
    trGbeDomMinsPts: num(field(tr, 'gbeDomMinsPts', 'GBEDomesticMinutesPoints')),
    trGbeContMinsPts: num(field(tr, 'gbeContMinsPts', 'GBEContinentalMinutesPoints')),
    trGbeLeaguePosPts: num(field(tr, 'gbeLeaguePosPts', 'GBELeaguePositionPoints')),
    trGbeContProgPts: num(field(tr, 'gbeContProgPts', 'GBEContinentalProgressionPoints')),
    trGbeLeagueStdPts: num(field(tr, 'gbeLeagueStdPts', 'GBELeagueStandardPoints')),

    xtvHistory: xtvHistoryFrom(tr),
    transferHistory: transferHistoryFrom(tr),

    dataProvenance: (row.data_provenance ?? {}) as DataProvenance,
  };
}
