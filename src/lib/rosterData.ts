/**
 * The agency's client roster.
 *
 * Backed by the `scouted_targets` table rather than a bundled file, so players
 * are added and edited at runtime. Rows arrive enriched from Transfermarkt and
 * TransferRoom; see `useEnrichScoutedTarget`.
 *
 * The shape deliberately drops the club-owner financial fields this codebase
 * carried (economic rights, release clauses, incoming transfer fee, luvas) and
 * replaces them with the terms an agency actually holds: mandate dates,
 * exclusivity, commission, and sell-on entitlement.
 */

export interface XtvHistoryEntry {
  year: number;
  month: number;
  xtv: number;
}

export interface TransferHistoryEntry {
  fromTeam: string;
  toTeam: string;
  date: string;
  fee: number | null;
  feeEurM: number | null;
  transferType: string;
}

/**
 * Where a field's value came from.
 *
 * Roster rows are seeded from a Transfermarkt list, and some fields — contract
 * end above all — have no public source and are filled in by hand. A fabricated
 * contract date must never be mistaken for a known one: it decides when a player
 * may talk to other clubs and where the leverage sits.
 *
 * `placeholder` fields are badged in the UI, excluded from client-facing PDFs,
 * and ignored by the matching engine.
 */
export type FieldProvenance = 'verified' | 'transfermarkt' | 'placeholder';

/** Keyed by RosterPlayer field name. Absent key means unknown, treated as placeholder. */
export type DataProvenance = Partial<Record<keyof RosterPlayer, FieldProvenance>>;

export interface RosterPlayer {
  id: string;
  slug: string;
  name: string;
  fullName?: string;
  position: string;
  /** ISO `YYYY-MM-DD`, or legacy `DD/MM/YYYY`. Use parsePlayerDob(). */
  dob?: string;
  age?: number;
  nationality?: string;
  height?: string;
  foot?: string;
  currentClub?: string;
  previousClub?: string;
  league?: string;
  /** The registration holder's deal — when he can be sold or goes free. */
  contractEndDate?: string;

  // --- Loan ---
  // A loaned player has two clubs and two live contracts. `currentClub` is
  // whoever he turns out for; `ownerClub` holds the registration.
  tenure?: 'permanent' | 'loan' | 'free_agent';
  ownerClub?: string;
  ownerLeague?: string;
  loanClub?: string;
  loanLeague?: string;
  /** When the loan ends and he returns — a different question to contractEndDate. */
  loanContractEnd?: string;
  photoUrl?: string;
  tmLink?: string;
  videoUrl?: string;
  valuationUrl?: string;

  // --- Our mandate over this player ---
  mandateStart?: string;
  mandateEnd?: string;
  exclusive?: boolean;
  commissionPct?: number;
  sellOnPct?: number;

  marketValue?: number;
  salaryEstimate?: number;
  notes?: string;
  priorityRanking?: string;

  // --- TransferRoom ---
  trId?: number;
  trXtv?: number;
  trXtvChange6m?: number;
  trXtvChange12m?: number;
  trBaseValue?: number;
  trSellOnPct?: number;
  trAgencyVerified?: string;
  trEstSalaryLow?: number;
  trEstSalaryHigh?: number;
  trGbeScore?: number;
  trGbeResult?: string;
  trPlayingStyle?: string;
  trSecondPosition?: string;
  trInjuryRisk?: string;
  trAvailableForSale?: string;
  trAskingPrice?: number;
  trAgency?: string;
  trRating?: number;
  trPotential?: number;
  trEuPassport: boolean;
  trPreferredFoot?: string;
  trRecentMinsPct?: number;
  trGbeIntAppPts?: number;
  trGbeDomMinsPts?: number;
  trGbeContMinsPts?: number;
  trGbeLeaguePosPts?: number;
  trGbeContProgPts?: number;
  trGbeLeagueStdPts?: number;

  xtvHistory: XtvHistoryEntry[];
  transferHistory: TransferHistoryEntry[];

  dataProvenance: DataProvenance;
}

const POSITION_GROUPS: Record<string, string[]> = {
  GK: ['GK'],
  DEF: ['CB', 'LB', 'RB'],
  MID: ['DM', 'DM/CM', 'CM', 'AM'],
  FWD: ['CF', 'CF/SS', 'LW', 'RW', 'FW'],
};

export function getPositionGroup(position: string): string {
  for (const [group, positions] of Object.entries(POSITION_GROUPS)) {
    if (positions.includes(position)) return group;
  }
  return 'MID';
}

/**
 * Accepts ISO `YYYY-MM-DD` (how the DB stores it) or legacy `DD/MM/YYYY`.
 *
 * Returns null rather than throwing on a missing or unparseable date. A roster
 * player has no date of birth until enrichment has run against his Transfermarkt
 * link, which is most of the roster on the day it is imported — so "no date" is
 * the normal case here, not an error.
 */
export function parsePlayerDob(dob?: string | null): Date | null {
  if (!dob) return null;
  const parts = dob.includes('-') ? dob.split('-').map(Number) : dob.split('/').map(Number).reverse();
  const [year, month, day] = parts;
  if (!year || !month || !day) return null;
  const d = new Date(year, month - 1, day);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function getAge(dob?: string | null): number | undefined {
  const birth = parsePlayerDob(dob);
  if (!birth) return undefined;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export function hasTrData(player: RosterPlayer): boolean {
  return player.trId != null;
}

/**
 * Do we hold terms of our own on this player?
 *
 * Strictly the agency's side of the deal. A contract end is the *club's* term,
 * held on nearly every player, so counting it here would open an empty "Our
 * Mandate" block on the whole roster and imply representation we don't have.
 */
export function hasMandateData(player: RosterPlayer): boolean {
  return !!(
    player.mandateStart ||
    player.mandateEnd ||
    player.commissionPct ||
    player.sellOnPct ||
    player.exclusive != null
  );
}

/** Is there anything at all to put in the commercial block of a document? */
export function hasCommercialData(player: RosterPlayer): boolean {
  return !!(
    hasMandateData(player) ||
    player.contractEndDate ||
    player.loanContractEnd ||
    player.marketValue
  );
}

export function provenanceOf(
  player: RosterPlayer,
  field: keyof RosterPlayer,
): FieldProvenance {
  return player.dataProvenance?.[field] ?? 'placeholder';
}

/** True when a value is safe to print as fact on a document sent to a club. */
export function isPrintable(player: RosterPlayer, field: keyof RosterPlayer): boolean {
  return provenanceOf(player, field) !== 'placeholder';
}

// ---- Live xTV derivations from xtvHistory ----

function sortedHistory(player: RosterPlayer) {
  return [...(player.xtvHistory ?? [])].sort(
    (a, b) => a.year - b.year || a.month - b.month,
  );
}

/** Latest xTV in €M (raw € / 1,000,000). Falls back to the static trXtv field. */
export function getLatestXtvM(player: RosterPlayer): number | undefined {
  const hist = sortedHistory(player);
  if (hist.length > 0) return hist[hist.length - 1].xtv / 1_000_000;
  return player.trXtv;
}

/**
 * % change between the latest entry and the entry ~N months earlier, rounded to
 * a whole percent. Falls back to the static field when history is too short.
 */
function getXtvChangePct(
  player: RosterPlayer,
  monthsBack: number,
  fallback: number | undefined,
): number | undefined {
  const hist = sortedHistory(player);
  if (hist.length < 2) return fallback;
  const latest = hist[hist.length - 1];
  const targetYear = latest.year + Math.floor((latest.month - 1 - monthsBack) / 12);
  const targetMonth = ((((latest.month - 1 - monthsBack) % 12) + 12) % 12) + 1;
  const latestIdx = latest.year * 12 + latest.month;
  const wantIdx = targetYear * 12 + targetMonth;

  let prev = hist.find((h) => h.year === targetYear && h.month === targetMonth);
  if (!prev) {
    // closest entry at or before the target date
    const candidates = hist.filter(
      (h) => h.year * 12 + h.month <= wantIdx && h.year * 12 + h.month < latestIdx,
    );
    prev = candidates[candidates.length - 1];
  }
  if (!prev || prev.xtv === 0) return fallback;
  return Math.round(((latest.xtv - prev.xtv) / prev.xtv) * 100);
}

export function getXtvChange6mPct(player: RosterPlayer): number | undefined {
  return getXtvChangePct(player, 6, player.trXtvChange6m);
}

export function getXtvChange12mPct(player: RosterPlayer): number | undefined {
  return getXtvChangePct(player, 12, player.trXtvChange12m);
}
