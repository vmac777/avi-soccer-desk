import { matchRosterToRequirement, isPricedOut, type ClubRequirement } from '@/lib/matching';
import { requirementSummary } from '@/lib/shortlistToPitch';
import { getAge, getLatestXtvM, getXtvChange6mPct, type RosterPlayer } from '@/lib/rosterData';
import { parseDateKey } from '@/lib/dateKeys';
import { formatMoneyShort } from '@/lib/money';

/**
 * What an agent should do next, worked out rather than counted.
 *
 * The desk holds four things nobody has ever joined up: what clubs are looking
 * for, who we represent, whose contracts are running down, and who owes whom an
 * answer. Each join is a sentence a good analyst would write, and each one is
 * checkable — every card links to the record it came from.
 *
 * Deliberately pure: no React, no Supabase, no clock of its own. Every one of
 * these sentences is a claim about a client's business, and a wrong one in
 * front of him is worse than a blank screen — so it all has to be testable.
 *
 * The rule throughout is that silence beats invention. A join that cannot be
 * computed from real data produces nothing at all rather than a hedged card.
 */

export type OpportunityKind =
  | 'ball_in_court'
  | 'deadline_near'
  | 'unworked_match'
  | 'contract_clock'
  | 'quiet_club'
  | 'value_moved';

export interface Opportunity {
  kind: OpportunityKind;
  /** Stable across renders, so React keys do not thrash. */
  id: string;
  /** The sentence. Assembled here so the page renders and does not decide. */
  headline: string;
  /** Why it is worth doing now, one clause. */
  detail: string;
  /** Higher first. */
  urgency: number;
  href: string;
}

/** Only these count as a live conversation. Mirrors BUY_ACTIVE_STAGES. */
const ACTIVE_STAGES = ['Enquiry', 'Negotiation', 'Closing'];

/** A contract inside this many months is leverage that is running out. */
const CONTRACT_CLOCK_MONTHS = 12;
/** Past this, a club that told us what it wants has been left alone too long. */
const QUIET_DAYS = 60;
/** Below this, a valuation move is noise rather than news. */
const VALUE_MOVE_PCT = 15;
/** A deadline further out than this is not yet today's problem. */
const DEADLINE_DAYS = 21;

export interface BoardInput {
  requirements: ClubRequirement[];
  /** Shortlist rows, only the two fields the joins need. */
  shortlistEntries: { requirement_id: string; scouted_target_id: string }[];
  roster: RosterPlayer[];
  pitches: {
    id: string;
    scouted_target_id: string;
    stage: string;
    ball_in_court: string | null;
    deadline?: string | null;
    updated_at: string;
  }[];
  contacts: { id: string; club: string; days_since_contact: number | null }[];
  /** Club id → display name, for needs filed against a club row. */
  clubNames: Record<string, string>;
  /** Contact id → their club, for needs filed against a person. */
  contactClubs: Record<string, string>;
  /** `YYYY-MM-DD`. Passed in rather than read, so tests can fix the date. */
  today: string;
}

const daysBetween = (fromKey: string, toKey: string): number =>
  Math.round((parseDateKey(toKey).getTime() - parseDateKey(fromKey).getTime()) / 86_400_000);

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

/** Whose need this is, however it was filed. Empty when it cannot be resolved. */
function clubOf(req: ClubRequirement, input: BoardInput): string {
  if (req.club_id && input.clubNames[req.club_id]) return input.clubNames[req.club_id];
  if (req.contact_id && input.contactClubs[req.contact_id]) return input.contactClubs[req.contact_id];
  return '';
}

/**
 * Pitches that are alive, by player.
 *
 * Used to keep the contract-clock card quiet about a player already being
 * worked — his contract running down is not news if there is a live
 * conversation about him.
 */
function activePitchPlayerIds(input: BoardInput): Set<string> {
  return new Set(
    input.pitches
      .filter((p) => ACTIVE_STAGES.includes(p.stage))
      .map((p) => p.scouted_target_id),
  );
}

const playerName = (roster: RosterPlayer[], id: string) =>
  roster.find((p) => p.id === id)?.name ?? '';

// ── The joins ─────────────────────────────────────────────────────────────

/** Deals stalled on us. The only queue an agent controls outright. */
function ballInCourt(input: BoardInput): Opportunity[] {
  const ours = input.pitches
    .filter((p) => p.ball_in_court === 'us' && ACTIVE_STAGES.includes(p.stage))
    .sort((a, b) => a.updated_at.localeCompare(b.updated_at));
  if (ours.length === 0) return [];

  const oldest = ours[0];
  const name = playerName(input.roster, oldest.scouted_target_id);
  const stale = daysBetween(oldest.updated_at.slice(0, 10), input.today);

  return [{
    kind: 'ball_in_court',
    id: 'ball_in_court',
    headline: ours.length === 1
      ? `One placement is waiting on you${name ? ` — ${name}` : ''}.`
      : `${ours.length} placements are waiting on you.`,
    detail: stale > 0
      ? `Longest untouched for ${stale} ${plural(stale, 'day')}.`
      : 'Nobody else can move these.',
    urgency: 100 + Math.min(stale, 60),
    href: '/pitches',
  }];
}

/** A window closing is the one deadline nobody can negotiate. */
function deadlineNear(input: BoardInput): Opportunity[] {
  return input.pitches
    .filter((p) => ACTIVE_STAGES.includes(p.stage) && p.deadline)
    .map((p) => ({ p, days: daysBetween(input.today, p.deadline!.slice(0, 10)) }))
    .filter(({ days }) => days >= 0 && days <= DEADLINE_DAYS)
    .sort((a, b) => a.days - b.days)
    .slice(0, 2)
    .map(({ p, days }) => {
      const name = playerName(input.roster, p.scouted_target_id);
      return {
        kind: 'deadline_near' as const,
        id: `deadline:${p.id}`,
        headline: days === 0
          ? `${name || 'A placement'} hits its deadline today.`
          : `${name || 'A placement'} has ${days} ${plural(days, 'day')} to its deadline.`,
        detail: `Still at ${p.stage.toLowerCase()}.`,
        urgency: 95 - days,
        href: '/pitches',
      };
    });
}

/**
 * A club asked, we have the players, and nobody has sent anything.
 *
 * The flagship join, and the one most likely to be news: it needs the need, the
 * roster and the shortlist all read together, which no screen did before.
 * Priced-out players are excluded, so "three of yours fit" means three he could
 * actually sign.
 */
function unworkedMatches(input: BoardInput): Opportunity[] {
  const listed = new Set(input.shortlistEntries.map((e) => e.requirement_id));

  return input.requirements
    .filter((r) => r.status === 'open' && !listed.has(r.id))
    .map((r) => ({
      r,
      fits: matchRosterToRequirement(input.roster, r).filter((m) => !isPricedOut(m)),
    }))
    .filter(({ fits }) => fits.length > 0)
    .sort((a, b) => b.fits.length - a.fits.length)
    // One card per club. Two needs at the same club is one conversation, and
    // stacking "Bahia want…" twice reads as repetition rather than as demand.
    .filter((x, _i, all) => all.findIndex(
      (y) => clubOf(y.r, input) === clubOf(x.r, input)) === all.indexOf(x))
    .slice(0, 3)
    .map(({ r, fits }) => {
      const club = clubOf(r, input);
      const alsoAtClub = input.requirements.filter((o) =>
        o.id !== r.id && o.status === 'open' && !listed.has(o.id)
        && clubOf(o, input) === club && club !== '').length;
      return {
        kind: 'unworked_match' as const,
        id: `unworked:${r.id}`,
        headline: `${club || 'A club'} want ${requirementSummary(r)}.`,
        detail: [
          `${fits.length} of yours ${plural(fits.length, 'fits', 'fit')} and nobody has been put forward.`,
          alsoAtClub > 0 ? `${alsoAtClub} more open ${plural(alsoAtClub, 'need')} there.` : null,
        ].filter(Boolean).join(' '),
        urgency: 80 + Math.min(fits.length, 10),
        href: `/needs/${r.id}`,
      };
    });
}

/**
 * A contract running down on a player nobody is working.
 *
 * His leverage peaks the moment a club can sign him cheaply, and vanishes the
 * day he signs an extension. Stays quiet when there is already a live pitch —
 * that is not news, it is the thing already in hand.
 */
function contractClocks(input: BoardInput): Opportunity[] {
  const beingWorked = activePitchPlayerIds(input);

  return input.roster
    .filter((p) => p.contractEndDate && !beingWorked.has(p.id))
    .map((p) => ({ p, days: daysBetween(input.today, p.contractEndDate!.slice(0, 10)) }))
    .filter(({ days }) => days >= 0 && days <= CONTRACT_CLOCK_MONTHS * 30)
    .sort((a, b) => a.days - b.days)
    .slice(0, 2)
    .map(({ p, days }) => {
      const months = Math.max(1, Math.round(days / 30));
      const age = getAge(p.dob) ?? p.age;
      return {
        kind: 'contract_clock' as const,
        id: `contract:${p.id}`,
        headline: `${p.name}'s contract runs out in ${months} ${plural(months, 'month')}.`,
        detail: [
          p.currentClub ? `At ${p.currentClub}` : null,
          age != null ? `${age}` : null,
          'no live pitch',
        ].filter(Boolean).join(' · '),
        urgency: 70 + Math.round((CONTRACT_CLOCK_MONTHS * 30 - days) / 30),
        href: `/roster/${p.id}`,
      };
    });
}

/**
 * They told us what they wanted and then heard nothing.
 *
 * The most embarrassing gap on the desk, and invisible until needs and
 * staleness are read together.
 */
function quietClubs(input: BoardInput): Opportunity[] {
  const openByClub: Record<string, number> = {};
  input.requirements
    .filter((r) => r.status === 'open')
    .forEach((r) => {
      const club = clubOf(r, input);
      if (club) openByClub[club] = (openByClub[club] ?? 0) + 1;
    });

  return Object.entries(openByClub)
    .map(([club, openCount]) => {
      // The warmest contact at the club is the fairest reading of how long it
      // has really been — one cold colleague is not a cold relationship.
      const days = input.contacts
        .filter((c) => c.club === club && c.days_since_contact != null)
        .reduce<number | null>((best, c) => {
          const d = c.days_since_contact as number;
          return best == null || d < best ? d : best;
        }, null);
      return { club, openCount, days };
    })
    .filter((x): x is { club: string; openCount: number; days: number } =>
      x.days != null && x.days >= QUIET_DAYS)
    .sort((a, b) => b.days - a.days)
    .slice(0, 2)
    .map(({ club, openCount, days }) => ({
      kind: 'quiet_club' as const,
      id: `quiet:${club}`,
      headline: `${club} have ${openCount} open ${plural(openCount, 'need')} and have not heard from you in ${days} days.`,
      detail: 'They asked. Nobody went back.',
      urgency: 60 + Math.min(Math.round(days / 10), 20),
      href: '/contacts',
    }));
}

/**
 * A player worth materially more than he was, against clubs who want his
 * profile. The moment to move, and nothing on the desk announced it.
 */
function valueMoved(input: BoardInput): Opportunity[] {
  const openNeeds = input.requirements.filter((r) => r.status === 'open');

  return input.roster
    .map((p) => ({ p, change: getXtvChange6mPct(p) }))
    .filter((x): x is { p: RosterPlayer; change: number } =>
      x.change != null && x.change >= VALUE_MOVE_PCT)
    .map(({ p, change }) => ({
      p,
      change,
      wanting: openNeeds.filter((r) =>
        matchRosterToRequirement([p], r).some((m) => !isPricedOut(m))),
    }))
    .filter(({ wanting }) => wanting.length > 0)
    .sort((a, b) => b.change - a.change)
    .slice(0, 2)
    .map(({ p, change, wanting }) => {
      const xtv = getLatestXtvM(p);
      return {
        kind: 'value_moved' as const,
        id: `value:${p.id}`,
        headline: `${p.name} is up ${Math.round(change)}% in six months${xtv != null ? ` to ${formatMoneyShort(xtv * 1_000_000)}` : ''}.`,
        detail: `${wanting.length} open ${plural(wanting.length, 'need')} he fits.`,
        urgency: 50 + Math.min(Math.round(change), 30),
        href: `/roster/${p.id}`,
      };
    });
}

/** Everything worth doing, most pressing first. */
export function buildBoard(input: BoardInput): Opportunity[] {
  return [
    ...ballInCourt(input),
    ...deadlineNear(input),
    ...unworkedMatches(input),
    ...contractClocks(input),
    ...quietClubs(input),
    ...valueMoved(input),
  ].sort((a, b) => b.urgency - a.urgency || a.id.localeCompare(b.id));
}

/**
 * How much of the roster the board could actually see.
 *
 * A contract-clock card that has only read two thirds of the book is not wrong,
 * but it is partial. Saying so is the difference between a tool an agent trusts
 * and one he checks behind.
 */
export function rosterCoverage(targets: { tm_status?: string | null; tr_status?: string | null }[]) {
  const total = targets.length;
  const enriched = targets.filter((t) => t.tm_status === 'ok' || t.tr_status === 'ok').length;
  return { total, enriched, missing: total - enriched };
}
