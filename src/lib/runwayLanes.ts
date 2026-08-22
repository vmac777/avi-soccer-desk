/**
 * Where each contract-runway label goes so none of them land on each other.
 *
 * The band plots one dot per player at `months / 12` across its width, which is
 * the whole point of drawing it — the shape tells you how much of the book has
 * to move this window. But four players inside four months put four labels at
 * nearly the same x, and they overlapped into an unreadable smear. Capping the
 * number of pins did not help, because the problem is density rather than count.
 *
 * So the dots never move: each stays on its true month. Only the labels are
 * displaced, into stacked lanes above the baseline, with a leader line down to
 * the dot they belong to. A pin that would need a fourth lane is not drawn at
 * all and is counted instead — three rows of labels is the most the band can
 * carry before it stops being a band.
 *
 * Pure, and separate from the component, because this is the rule that was
 * wrong and a rule you cannot test is a rule you get to be wrong about twice.
 */

export interface RunwayPin {
  id: string;
  name: string;
  months: number;
}

export interface LanedPin extends RunwayPin {
  /** 0-based, counting up away from the baseline. */
  lane: number;
  /** Percent across the band. Always the player's true position. */
  x: number;
}

/** How much horizontal room a label needs, as a percentage of the band. */
const LABEL_WIDTH_PCT = 14;

/** Three rows of labels is the most a 12-month band can carry. */
export const MAX_LANES = 3;

/**
 * Keeps the dot inside the band. A contract with zero months left sits at 0%,
 * where half the label would hang off the left edge, so the ends are inset.
 */
const clampX = (months: number) => Math.min(96, Math.max(4, (months / 12) * 100));

export function assignLanes(
  pins: RunwayPin[],
  opts: { maxLanes?: number; labelWidthPct?: number } = {},
): { laned: LanedPin[]; hidden: number } {
  const maxLanes = opts.maxLanes ?? MAX_LANES;
  const gap = opts.labelWidthPct ?? LABEL_WIDTH_PCT;

  // Soonest first: the contracts about to expire are the ones worth reading, so
  // they get the lane nearest the baseline and the shortest leader line.
  const sorted = [...pins].sort((a, b) => a.months - b.months);

  /** Rightmost x already occupied in each lane. */
  const lastX: number[] = [];
  const laned: LanedPin[] = [];
  let hidden = 0;

  for (const pin of sorted) {
    const x = clampX(pin.months);
    let lane = -1;
    for (let i = 0; i < maxLanes; i++) {
      if (lastX[i] === undefined || x - lastX[i] >= gap) { lane = i; break; }
    }
    // Every lane is occupied at this x. Drawing it anyway is what produced the
    // smear, so it is counted rather than crammed.
    if (lane === -1) { hidden++; continue; }
    lastX[lane] = x;
    laned.push({ ...pin, lane, x });
  }

  return { laned, hidden };
}
