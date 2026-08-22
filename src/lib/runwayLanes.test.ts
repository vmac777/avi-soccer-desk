import { describe, it, expect } from 'vitest';
import { assignLanes, MAX_LANES } from './runwayLanes';

/**
 * The bug this replaces: four contracts inside four months drew four labels at
 * nearly the same x, and they overlapped into a smear that read as one word.
 * What matters here is that crowding moves labels and never moves dots — the
 * dot is the data.
 */

const pin = (id: string, months: number) => ({ id, name: id, months });

describe('assignLanes', () => {
  it('leaves well-spread pins on one lane', () => {
    const { laned, hidden } = assignLanes([pin('a', 1), pin('b', 6), pin('c', 11)]);
    expect(laned.map((p) => p.lane)).toEqual([0, 0, 0]);
    expect(hidden).toBe(0);
  });

  it('stacks a crowd instead of overlapping it', () => {
    // The exact case from the screenshot: one at 3 months, three at 4.
    const { laned, hidden } = assignLanes([
      pin('Lyncon', 3), pin('Allan', 4), pin('Alerrandro', 4), pin('Gabriel', 4),
    ]);
    expect(laned).toHaveLength(3);
    expect(laned.map((p) => p.lane)).toEqual([0, 1, 2]);
    // The fourth would need a lane that does not exist.
    expect(hidden).toBe(1);
  });

  it('never moves a dot to make room for a label', () => {
    const { laned } = assignLanes([pin('a', 6), pin('b', 6)]);
    // Both are genuinely at six months, so both sit at the same x — one above
    // the other. Nudging the second along the axis would be drawing a contract
    // length nobody has.
    expect(laned[0].x).toBe(laned[1].x);
    expect(laned[0].lane).not.toBe(laned[1].lane);
  });

  it('reads soonest first, so the urgent contract gets the shortest leader', () => {
    const { laned } = assignLanes([pin('later', 4), pin('sooner', 3)]);
    expect(laned[0].id).toBe('sooner');
    expect(laned[0].lane).toBe(0);
  });

  it('puts the ends inside the band rather than half off it', () => {
    const { laned } = assignLanes([pin('expiring', 0), pin('full-year', 12)]);
    expect(laned[0].x).toBeGreaterThan(0);
    expect(laned[1].x).toBeLessThan(100);
  });

  it('frees a lane again once there is room to its right', () => {
    // Lane 0 takes 1m; 2m is too close so it goes to lane 1; 11m is clear of
    // everything, so it drops back to lane 0 rather than climbing.
    const { laned } = assignLanes([pin('a', 1), pin('b', 2), pin('c', 11)]);
    expect(laned.map((p) => p.lane)).toEqual([0, 1, 0]);
  });

  it('counts everything it could not draw', () => {
    const crowd = Array.from({ length: 9 }, (_, i) => pin(`p${i}`, 4));
    const { laned, hidden } = assignLanes(crowd);
    expect(laned).toHaveLength(MAX_LANES);
    expect(hidden).toBe(9 - MAX_LANES);
  });

  it('says nothing about an empty band', () => {
    expect(assignLanes([])).toEqual({ laned: [], hidden: 0 });
  });
});
