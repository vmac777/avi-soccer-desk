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

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v : undefined;

function xtvHistoryFrom(tr: Record<string, unknown>): XtvHistoryEntry[] {
  const raw = tr.xtvHistory ?? tr.xtv_history;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e) => {
      const o = readTr(e);
      const year = num(o.year), month = num(o.month), xtv = num(o.xtv);
      return year && month && xtv != null ? { year, month, xtv } : null;
    })
    .filter((e): e is XtvHistoryEntry => e !== null);
}

function transferHistoryFrom(tr: Record<string, unknown>): TransferHistoryEntry[] {
  const raw = tr.transferHistory ?? tr.transfer_history;
  if (!Array.isArray(raw)) return [];
  return raw.map((e) => {
    const o = readTr(e);
    return {
      fromTeam: str(o.fromTeam ?? o.from_team) ?? '',
      toTeam: str(o.toTeam ?? o.to_team) ?? '',
      date: str(o.date) ?? '',
      fee: num(o.fee) ?? null,
      feeEurM: num(o.feeEurM ?? o.fee_eur_m) ?? null,
      transferType: str(o.transferType ?? o.transfer_type) ?? '',
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
    trXtvChange6m: num(tr.xtvChange6m ?? tr.xtv_change_6m),
    trXtvChange12m: num(tr.xtvChange12m ?? tr.xtv_change_12m),
    trBaseValue: num(tr.baseValue ?? tr.base_value),
    trSellOnPct: num(tr.sellOnPct ?? tr.sell_on_pct),
    trAgency: str(tr.agency),
    trAgencyVerified: str(tr.agencyVerified ?? tr.agency_verified),
    trEstSalaryLow: num(tr.estSalaryLow ?? tr.est_salary_low),
    trEstSalaryHigh: num(tr.estSalaryHigh ?? tr.est_salary_high),
    trGbeScore: num(row.gbe_score) ?? num(tr.gbeScore),
    trGbeResult: str(tr.gbeResult ?? tr.gbe_result),
    trPlayingStyle: str(tr.playingStyle ?? tr.playing_style),
    trSecondPosition: str(tr.secondPosition ?? tr.second_position),
    trInjuryRisk: str(tr.injuryRisk ?? tr.injury_risk),
    trAvailableForSale: row.tr_availability || undefined,
    trAskingPrice: row.tr_asking_price ?? undefined,
    trRating: num(tr.rating),
    trPotential: num(tr.potential),
    trEuPassport: tr.euPassport === true || tr.eu_passport === true,
    trPreferredFoot: str(tr.preferredFoot ?? tr.preferred_foot) ?? row.foot ?? undefined,
    trRecentMinsPct: num(tr.recentMinsPct ?? tr.recent_mins_pct),
    trGbeIntAppPts: num(tr.gbeIntAppPts),
    trGbeDomMinsPts: num(tr.gbeDomMinsPts),
    trGbeContMinsPts: num(tr.gbeContMinsPts),
    trGbeLeaguePosPts: num(tr.gbeLeaguePosPts),
    trGbeContProgPts: num(tr.gbeContProgPts),
    trGbeLeagueStdPts: num(tr.gbeLeagueStdPts),

    xtvHistory: xtvHistoryFrom(tr),
    transferHistory: transferHistoryFrom(tr),

    dataProvenance: (row.data_provenance ?? {}) as DataProvenance,
  };
}
