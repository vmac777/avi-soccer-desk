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

import { defaultComparablePositions } from '@/lib/marketBriefTypes';
import {
  type RosterPlayer,
  getAge,
  getLatestXtvM,
  provenanceOf,
} from '@/lib/rosterData';

export interface ClubRequirement {
  id: string;
  contact_id: string;
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
  factor: 'age' | 'budget' | 'foot' | 'eu_passport' | 'league';
  verdict: 'fits' | 'close' | 'misses' | 'unknown';
  detail: string;
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
  foot: 10,
  eu_passport: 15,
  league: 10,
} as const;

/**
 * Does this player play the position the club is asking for?
 *
 * Compares comparable-position clusters rather than exact codes, so a club
 * asking for a DM sees a CM, using the same mapping the brief generator uses.
 */
export function positionMatches(
  player: RosterPlayer,
  requirement: ClubRequirement,
): boolean {
  const wanted = defaultComparablePositions(requirement.position);
  const has = defaultComparablePositions(player.position);
  if (wanted.length === 0 || has.length === 0) return false;
  return has.some((code) => wanted.includes(code));
}

/** A player's age, preferring a real date of birth over a stored integer. */
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
  if (req.budget_max == null) {
    return {
      points: WEIGHTS.budget,
      reason: { factor: 'budget', verdict: 'fits', detail: 'No budget stated' },
    };
  }
  const m = (n: number) => `€${(n / 1_000_000).toFixed(1)}m`;
  if (value <= req.budget_max) {
    return {
      points: WEIGHTS.budget,
      reason: {
        factor: 'budget',
        verdict: 'fits',
        detail: `${m(value)} within ${m(req.budget_max)}`,
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
      detail: `${m(value)} over ${m(req.budget_max)}`,
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
