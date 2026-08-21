import type { BuyPitchStage } from '@/hooks/useBuyData';

/**
 * The three conversations a placement is made of.
 *
 * Each ladder ends in agreement or refusal. A dead track is not an absence of
 * progress — it is the thing an agent acts on, and the moment to go back to the
 * other clubs. So refusal is a state, not a missing state.
 */
export const SELLING_TRACK = ['none', 'enquired', 'price_set', 'bid_in', 'fee_agreed', 'refused'] as const;
export const BUYING_TRACK = ['none', 'sounded_out', 'interested', 'bid_made', 'terms_offered', 'terms_agreed', 'passed'] as const;
export const PLAYER_TRACK = ['none', 'talking', 'willing', 'agreed', 'declined'] as const;

export type SellingTrack = typeof SELLING_TRACK[number];
export type BuyingTrack = typeof BUYING_TRACK[number];
export type PlayerTrack = typeof PLAYER_TRACK[number];

export interface Tracks {
  selling: SellingTrack;
  buying: BuyingTrack;
  player: PlayerTrack;
}

/** Labels for the chips. The stored values are terse; these are what an agent reads. */
export const TRACK_LABELS: Record<string, string> = {
  none: '—',
  enquired: 'Enquired',
  price_set: 'Price set',
  bid_in: 'Bid in',
  fee_agreed: 'Fee agreed',
  refused: 'Refused',
  sounded_out: 'Sounded out',
  interested: 'Interested',
  bid_made: 'Bid made',
  terms_offered: 'Terms offered',
  terms_agreed: 'Terms agreed',
  passed: 'Passed',
  talking: 'Talking',
  willing: 'Willing',
  agreed: 'Agreed',
  declined: 'Declined',
};

/** Which party has ended it, if any. Each refusal means something different. */
export function deadSide(t: Tracks): 'selling' | 'buying' | 'player' | null {
  if (t.selling === 'refused') return 'selling';
  if (t.buying === 'passed') return 'buying';
  if (t.player === 'declined') return 'player';
  return null;
}

/**
 * The stage the three tracks imply — a suggestion, never applied automatically.
 *
 * An agent frequently knows a deal is dead before any track says so, and often
 * keeps one alive that looks finished on paper. Moving the stage for them would
 * overwrite that judgement with arithmetic. So this returns what the tracks say
 * and the UI offers it; the click stays with the human.
 *
 * Returns null when the tracks already agree with the current stage, or when
 * they say nothing worth acting on.
 */
export function suggestedStage(t: Tracks, current: BuyPitchStage): BuyPitchStage | null {
  const suggestion = stageFromTracks(t);
  return suggestion && suggestion !== current ? suggestion : null;
}

/** The stage the tracks describe, ignoring whatever the pitch currently says. */
export function stageFromTracks(t: Tracks): BuyPitchStage | null {
  // A refusal outranks everything else: one party out is the whole deal out,
  // whichever of the other two were still willing.
  const dead = deadSide(t);
  if (dead === 'selling') return 'Rejected';   // they will not let him go
  if (dead === 'buying') return 'Lost';        // the club went elsewhere
  if (dead === 'player') return 'Walked';      // he does not want it

  const feeDone = t.selling === 'fee_agreed';
  const termsDone = t.buying === 'terms_agreed';
  const playerDone = t.player === 'agreed';

  // Everything agreed is not "signed" — a medical, a work permit and a
  // registration deadline all still sit between here and done.
  if (feeDone && termsDone && playerDone) return 'Closing';
  if (feeDone || termsDone) return 'Closing';

  const moving =
    t.selling !== 'none' && t.selling !== 'enquired'
    || t.buying !== 'none' && t.buying !== 'sounded_out'
    || t.player === 'willing' || t.player === 'agreed';
  if (moving) return 'Negotiation';

  const started = t.selling !== 'none' || t.buying !== 'none' || t.player !== 'none';
  return started ? 'Enquiry' : null;
}

/**
 * Plain-English reason for a suggestion, so the prompt says why rather than
 * just asserting a stage.
 */
export function suggestionReason(t: Tracks): string {
  const dead = deadSide(t);
  if (dead === 'selling') return 'the selling club has refused';
  if (dead === 'buying') return 'the buying club has passed';
  if (dead === 'player') return 'the player has declined';
  if (t.selling === 'fee_agreed' && t.buying === 'terms_agreed') return 'fee and terms are both agreed';
  if (t.selling === 'fee_agreed') return 'the fee is agreed';
  if (t.buying === 'terms_agreed') return 'terms are agreed';
  return 'the tracks have moved on';
}
