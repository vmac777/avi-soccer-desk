/**
 * Matching the roster against what clubs say they need.
 *
 * Pure functions, scored client-side. The data is small — tens of players
 * against tens of open requirements — and the weights will change as soon as the
 * agency tells us what actually matters, which is much easier to iterate here
 * than in a SQL view.
 *
 * Two rules the scoring will not bend on:
 *
 *   1. Position is a hard filter, not a weight. A club looking for a centre-back
 *      is not interested in a winger who scores well on everything else.
 *   2. A `placeholder` field never contributes. Roster rows are seeded from
 *      Transfermarkt, which has no reliable contract data, so some values are
 *      filled in by hand. An invented contract date must not produce a
 *      recommendation that reads as evidence.
 */

import { formatMoneyShort } from '@/lib/money';
import {
  type RosterPlayer,
  getAge,
  getLatestXtvM,
  provenanceOf,
} from '@/lib/rosterData';

export interface ClubRequirement {
  id: string;
  /** Whose need this is. Null only for a legacy row filed against a person. */
  club_id: string | null;
  /** Who told us. Null once that person has left the club. */
  contact_id: string | null;
  position: string;
  age_min: number | null;
  age_max: number | null;
  budget_min: number | null;
  budget_max: number | null;
  salary_max: number | null;
  foot: string | null;
  needs_eu_passport: boolean;
  league_experience: string[];
  window_target: string | null;
  status: 'open' | 'filled' | 'withdrawn';
  notes: string | null;
}

/** Why a player scored the way they did, in words the desk can read. */
export interface MatchReason {
  factor: 'age' | 'budget' | 'salary' | 'foot' | 'eu_passport' | 'league';
  verdict: 'fits' | 'close' | 'misses' | 'unknown';
  detail: string;
  /**
   * Which side of a stated fee band the player fell off, on budget misses only.
   *
   * Both directions are misses, but they are opposite facts and the desk labels
   * them differently: "priced out" is true of one and the reverse of the truth
   * about the other. Absent on every other reason, and absent on rows scored
   * before fee floors existed — which is why `isPricedOut` treats a missing
   * direction as "over".
   */
  direction?: 'over' | 'under';
}

export interface MatchResult {
  requirementId: string;
  playerId: string;
  /** 0–100. Only meaningful once the position filter has passed. */
  score: number;
  reasons: MatchReason[];
}

/** Relative pull of each factor. Sums to 100 when everything is known. */
const WEIGHTS = {
  age: 30,
  budget: 35,
  salary: 15,
  foot: 10,
  eu_passport: 15,
  league: 10,
} as const;

/**
 * Position codes reduced to the job the club is actually asking for.
 *
 * Not the same thing as `defaultComparablePositions` in marketBriefTypes, and
 * deliberately different. That map answers "whose transfer fee is a fair comp
 * for this player's", where a €10m right back genuinely is a comp for a €10m
 * left back. This one answers "did the club ask for this player", where the
 * side of the pitch he plays on can decide everything.
 *
 * Eight buckets, agreed with the desk:
 *
 *   GK · CB · LB(+LWB) · RB(+RWB) · CM(+DM) · AM · W(wide) · CF(+SS)
 *
 * Three of those are naming conventions collapsing (ST/FW→CF, CDM→CM,
 * CAM→AM). The rest are judgement calls:
 *
 *   * **Full backs keep their side.** A club needing a left back does not want
 *     a right back, whatever their fees have in common.
 *   * **Wingers do not.** An inverted left-footer plays on the right as a
 *     matter of course, so LW/RW/LM/RM are one wide-attacker bucket.
 *   * **DM sits with CM**, because plenty of clubs say "central midfielder"
 *     and mean either.
 *   * **SS sits with CF and pointedly not with AM.** That last part is the
 *     whole reason an AM brief used to return centre-forwards: SS appeared in
 *     both clusters, and expanding both sides made AM≈SS and CF≈SS into
 *     AM≈CF — a pairing nothing ever asserted. A ten and a nine stay apart.
 */
const POSITION_BUCKET: Record<string, string> = {
  // Forwards: one job, four labels, plus the second striker.
  ST: 'CF', FW: 'CF', SS: 'CF',
  // Wide attackers, either flank.
  LW: 'W', RW: 'W', LM: 'W', RM: 'W',
  // Central midfield, holding or otherwise.
  DM: 'CM', CDM: 'CM',
  CAM: 'AM',
  // Full backs keep their side; the wing-back variant does not change it.
  LWB: 'LB', RWB: 'RB',
};

/**
 * What to call a position on screen.
 *
 * It lives here, against the bucket table, because the two must never disagree.
 * `ST` and `CF` are the same search — the bucket has said so since the position
 * rules were written — but the need dialog only ever offered the letters `CF`,
 * so an agent looking to sign a striker found no striker in the list and
 * reasonably concluded the desk could not do it.
 *
 * Only the forward line is renamed. `LWB`/`LB` and `DM`/`CM` are the same kind
 * of pair and would benefit from the same treatment, but reshaping the whole
 * picker is a bigger decision than the one that was asked for.
 */
const POSITION_LABEL: Record<string, string> = {
  CF: 'ST / CF',
  // Legacy rows saved before the second-striker chip was folded in. Never
  // offered as a choice now, but it must still render as itself.
  SS: 'SS',
};

export function positionLabel(code: string | null | undefined): string {
  const key = (code || '').toUpperCase().trim();
  return POSITION_LABEL[key] ?? code ?? '';
}

/** Split "DM/CM" or "RB-CB" and reduce each part to its bucket. */
function positionCodes(position: string | null | undefined): string[] {
  const raw = (position || '').toUpperCase().trim();
  if (!raw) return [];
  return raw
    .split(/[/,\-|&+\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => POSITION_BUCKET[part] ?? part);
}

/**
 * Does this player play the position the club asked for?
 *
 * A hard filter, not a weight: a wrong-position player should not appear at
 * all rather than appear with a low score.
 *
 * Both sides reduce to buckets and are compared for equality, rather than each
 * expanding into a cluster and being intersected. Expansion on both sides makes
 * the relation transitive — which is exactly how an AM brief started returning
 * centre-forwards.
 *
 * A player listed with more than one position matches on any of them: a
 * "DM/CM" plays both, and the club asking for either is entitled to see him.
 */
export function positionMatches(player: RosterPlayer, requirement: ClubRequirement): boolean {
  const wanted = new Set(positionCodes(requirement.position));
  const has = positionCodes(player.position);
  if (wanted.size === 0 || has.length === 0) return false;
  return has.some((code) => wanted.has(code));
}

/**
 * Beyond what the club can pay, rather than merely expensive.
 *
 * Reads the verdict the scorer already produced, so the tolerance lives in one
 * place. `close` — inside a fifth over — is deliberately not priced out: a
 * club saying four million will often do four-eight with add-ons, and hiding
 * that band would hide real deals. An unknown valuation is never priced out
 * either; not knowing what a player is worth is not evidence he is too dear.
 */
export function isPricedOut(match: MatchResult): boolean {
  return match.reasons.some((r) =>
    r.factor === 'budget' && r.verdict === 'misses' && r.direction !== 'under');
}

/**
 * Below the level the club said it was shopping at.
 *
 * The opposite fact to `isPricedOut`, and it has to be nameable separately or
 * the desk files a three-hundred-thousand-euro player under "priced out" — a
 * heading that is not merely unhelpful but the reverse of true.
 *
 * Both are misses, and both keep a player off a shortlist. The distinction is
 * for the human reading the reason, which is the whole reason reasons exist.
 */
export function isUnderBand(match: MatchResult): boolean {
  return match.reasons.some((r) =>
    r.factor === 'budget' && r.verdict === 'misses' && r.direction === 'under');
}

/** Either side of a stated fee band — the players a shortlist should not carry. */
export function isOutsideFeeBand(match: MatchResult): boolean {
  return isPricedOut(match) || isUnderBand(match);
}

function ageOf(player: RosterPlayer): number | undefined {
  if (player.dob) {
    try {
      return getAge(player.dob);
    } catch {
      /* fall through to the stored age */
    }
  }
  return player.age;
}

/**
 * What we would ask for this player, in EUR. Prefers TransferRoom's xTV — it is
 * a live valuation — and falls back to the Transfermarkt market value.
 */
function valuationOf(player: RosterPlayer): number | undefined {
  const xtvM = getLatestXtvM(player);
  if (xtvM != null) return xtvM * 1_000_000;
  return player.marketValue;
}

/**
 * What this player would have to be paid, per year in EUR.
 *
 * Prefers our own estimate, since it usually comes from the agent's side of a
 * real conversation. TransferRoom's band is the fallback, and the top of it is
 * the honest number to test a ceiling against — quoting the bottom would let a
 * player clear a budget he will not actually sign for.
 */
function salaryOf(player: RosterPlayer): number | undefined {
  if (player.salaryEstimate != null) return player.salaryEstimate;
  return player.trEstSalaryHigh ?? player.trEstSalaryLow;
}

function scoreAge(
  player: RosterPlayer,
  req: ClubRequirement,
): { points: number; reason: MatchReason } {
  const age = ageOf(player);
  if (age == null) {
    return {
      points: 0,
      reason: { factor: 'age', verdict: 'unknown', detail: 'Age not known' },
    };
  }
  if (req.age_min == null && req.age_max == null) {
    return {
      points: WEIGHTS.age,
      reason: { factor: 'age', verdict: 'fits', detail: `${age} — no age brief` },
    };
  }
  const min = req.age_min ?? 0;
  const max = req.age_max ?? 99;
  if (age >= min && age <= max) {
    return {
      points: WEIGHTS.age,
      reason: { factor: 'age', verdict: 'fits', detail: `${age}, inside ${min}–${max}` },
    };
  }
  // A year or two outside is worth showing; further out is not.
  const distance = age < min ? min - age : age - max;
  if (distance <= 2) {
    return {
      points: Math.round(WEIGHTS.age * 0.5),
      reason: {
        factor: 'age',
        verdict: 'close',
        detail: `${age}, just outside ${min}–${max}`,
      },
    };
  }
  return {
    points: 0,
    reason: { factor: 'age', verdict: 'misses', detail: `${age}, wants ${min}–${max}` },
  };
}

/** `€5.0m–€10.0m`, or whichever end of it the club actually stated. */
export function feeBandLabel(req: Pick<ClubRequirement, 'budget_min' | 'budget_max'>): string | null {
  const m = formatMoneyShort;
  if (req.budget_min != null && req.budget_max != null) {
    return `${m(req.budget_min)}–${m(req.budget_max)}`;
  }
  if (req.budget_max != null) return `≤ ${m(req.budget_max)}`;
  if (req.budget_min != null) return `≥ ${m(req.budget_min)}`;
  return null;
}

function scoreBudget(
  player: RosterPlayer,
  req: ClubRequirement,
): { points: number; reason: MatchReason } {
  const value = valuationOf(player);
  if (value == null) {
    return {
      points: 0,
      reason: { factor: 'budget', verdict: 'unknown', detail: 'No valuation held' },
    };
  }
  const m = formatMoneyShort;

  /**
   * Below the floor the club named.
   *
   * Checked before the ceiling, because a club that says "five to ten million"
   * is describing the level it is shopping at, not just the most it will spend.
   * A three-hundred-thousand right-back clears a ten-million ceiling and is not
   * remotely the player they asked for — which is exactly what the desk was
   * putting at the top of its shortlists, because `budget_min` was written to
   * the database as null on every save and read by nothing.
   *
   * A floor with no ceiling still counts. It is the half of the band that says
   * "we are not shopping in the bargain bin", and it is the half that was
   * missing.
   */
  if (req.budget_min != null && value < req.budget_min) {
    const band = feeBandLabel(req);
    return {
      points: 0,
      reason: {
        factor: 'budget',
        verdict: 'misses',
        direction: 'under',
        detail: `${m(value)}, well under ${band ?? m(req.budget_min)}`,
      },
    };
  }

  if (req.budget_max == null) {
    return {
      points: WEIGHTS.budget,
      reason: {
        factor: 'budget',
        verdict: 'fits',
        detail: req.budget_min != null
          ? `${m(value)}, at or above ${m(req.budget_min)}`
          : 'No budget stated',
      },
    };
  }
  if (value <= req.budget_max) {
    return {
      points: WEIGHTS.budget,
      reason: {
        factor: 'budget',
        verdict: 'fits',
        // Names the band when the club stated one, and the ceiling alone when
        // that is all they gave us. "within ≤ €30.0m" is not English.
        detail: req.budget_min != null
          ? `${m(value)} within ${m(req.budget_min)}–${m(req.budget_max)}`
          : `${m(value)} within ${m(req.budget_max)}`,
      },
    };
  }
  // Within a fifth over budget is a conversation, not a rejection.
  if (value <= req.budget_max * 1.2) {
    return {
      points: Math.round(WEIGHTS.budget * 0.5),
      reason: {
        factor: 'budget',
        verdict: 'close',
        detail: `${m(value)} slightly over ${m(req.budget_max)}`,
      },
    };
  }
  return {
    points: 0,
    reason: {
      factor: 'budget',
      verdict: 'misses',
      direction: 'over',
      detail: `${m(value)} over ${m(req.budget_max)}`,
    },
  };
}

/**
 * Against the wage ceiling.
 *
 * A fee is one negotiation and a wage is another, and clubs lose deals on the
 * second far more often than the first. A shortlist that ignores what the club
 * can pay puts up players they cannot sign, which is the quickest way to stop
 * being the agent they call.
 *
 * Returns null when no ceiling was stated, so silence neither helps nor hurts.
 */
function scoreSalary(
  player: RosterPlayer,
  req: ClubRequirement,
): { points: number; reason: MatchReason } | null {
  if (req.salary_max == null) return null;

  const salary = salaryOf(player);
  if (salary == null) {
    return {
      points: 0,
      reason: { factor: 'salary', verdict: 'unknown', detail: 'No salary held' },
    };
  }

  const k = (n: number) => `${formatMoneyShort(n)}/yr`;
  if (salary <= req.salary_max) {
    return {
      points: WEIGHTS.salary,
      reason: {
        factor: 'salary',
        verdict: 'fits',
        detail: `${k(salary)} within ${k(req.salary_max)}`,
      },
    };
  }
  // Same tolerance as the fee: a fifth over is something an agent can work on,
  // through a signing bonus or a shorter deal.
  if (salary <= req.salary_max * 1.2) {
    return {
      points: Math.round(WEIGHTS.salary * 0.5),
      reason: {
        factor: 'salary',
        verdict: 'close',
        detail: `${k(salary)} slightly over ${k(req.salary_max)}`,
      },
    };
  }
  return {
    points: 0,
    reason: {
      factor: 'salary',
      verdict: 'misses',
      detail: `${k(salary)} over ${k(req.salary_max)}`,
    },
  };
}

function scoreFoot(
  player: RosterPlayer,
  req: ClubRequirement,
): { points: number; reason: MatchReason } | null {
  if (!req.foot) return null;
  const foot = player.trPreferredFoot || player.foot;
  if (!foot) {
    return {
      points: 0,
      reason: { factor: 'foot', verdict: 'unknown', detail: 'Preferred foot not known' },
    };
  }
  const fits =
    foot.toLowerCase() === req.foot.toLowerCase() || foot.toLowerCase() === 'both';
  return {
    points: fits ? WEIGHTS.foot : 0,
    reason: {
      factor: 'foot',
      verdict: fits ? 'fits' : 'misses',
      detail: fits ? `${foot} footed` : `${foot} footed, wants ${req.foot}`,
    },
  };
}

function scoreEuPassport(
  player: RosterPlayer,
  req: ClubRequirement,
): { points: number; reason: MatchReason } | null {
  if (!req.needs_eu_passport) return null;
  return player.trEuPassport
    ? {
        points: WEIGHTS.eu_passport,
        reason: { factor: 'eu_passport', verdict: 'fits', detail: 'Holds an EU passport' },
      }
    : {
        points: 0,
        reason: {
          factor: 'eu_passport',
          verdict: 'misses',
          detail: 'No EU passport — club requires one',
        },
      };
}

function scoreLeague(
  player: RosterPlayer,
  req: ClubRequirement,
): { points: number; reason: MatchReason } | null {
  if (!req.league_experience?.length) return null;
  const league = player.league;
  if (!league) {
    return {
      points: 0,
      reason: { factor: 'league', verdict: 'unknown', detail: 'Current league not known' },
    };
  }
  const fits = req.league_experience.some(
    (l) => l.toLowerCase() === league.toLowerCase(),
  );
  return {
    points: fits ? WEIGHTS.league : 0,
    reason: {
      factor: 'league',
      verdict: fits ? 'fits' : 'misses',
      detail: fits ? `Playing in ${league}` : `In ${league}, wants ${req.league_experience.join(' / ')}`,
    },
  };
}

/**
 * Score one player against one requirement.
 *
 * Returns null when the position does not match — that is a hard filter, and a
 * non-match should not appear in a list at all rather than appearing with a low
 * score.
 *
 * The score is normalised over the factors the club actually specified, so a
 * requirement stating only a position and a budget is not penalised for the
 * silence.
 */
export function scoreMatch(
  player: RosterPlayer,
  req: ClubRequirement,
): MatchResult | null {
  if (!positionMatches(player, req)) return null;

  const parts = [
    scoreAge(player, req),
    scoreBudget(player, req),
    scoreSalary(player, req),
    scoreFoot(player, req),
    scoreEuPassport(player, req),
    scoreLeague(player, req),
  ].filter((p): p is { points: number; reason: MatchReason } => p !== null);

  const available = parts.reduce((sum, p) => sum + WEIGHTS[p.reason.factor], 0);
  const earned = parts.reduce((sum, p) => sum + p.points, 0);
  const score = available === 0 ? 0 : Math.round((earned / available) * 100);

  return {
    requirementId: req.id,
    playerId: player.id,
    score,
    reasons: parts.map((p) => p.reason),
  };
}

/** Roster players who fit a club's requirement, best first. */
export function matchRosterToRequirement(
  roster: RosterPlayer[],
  req: ClubRequirement,
): MatchResult[] {
  if (req.status !== 'open') return [];
  return roster
    .map((p) => scoreMatch(p, req))
    .filter((m): m is MatchResult => m !== null)
    .sort((a, b) => b.score - a.score);
}

/** Open requirements a given player fits, best first. */
export function matchRequirementsToPlayer(
  requirements: ClubRequirement[],
  player: RosterPlayer,
): MatchResult[] {
  return requirements
    .filter((r) => r.status === 'open')
    .map((r) => scoreMatch(player, r))
    .filter((m): m is MatchResult => m !== null)
    .sort((a, b) => b.score - a.score);
}

/**
 * Fields the matching engine refuses to read because their value was filled in
 * by hand rather than sourced. Surfaced in the UI so the desk can see that a
 * match was made without them.
 */
export function unmatchableFields(player: RosterPlayer): string[] {
  const relevant: (keyof RosterPlayer)[] = ['contractEndDate', 'marketValue', 'league'];
  return relevant.filter((f) => provenanceOf(player, f) === 'placeholder');
}
