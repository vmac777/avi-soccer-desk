import { describe, it, expect } from 'vitest';
import {
  positionMatches,
  scoreMatch,
  matchRosterToRequirement,
  matchRequirementsToPlayer,
  unmatchableFields,
  type ClubRequirement,
} from './matching';
import type { RosterPlayer } from './rosterData';

function player(over: Partial<RosterPlayer> = {}): RosterPlayer {
  return {
    id: 'p1',
    slug: 'p1',
    name: 'Test Player',
    position: 'CM',
    trEuPassport: false,
    xtvHistory: [],
    transferHistory: [],
    dataProvenance: {},
    ...over,
  };
}

function requirement(over: Partial<ClubRequirement> = {}): ClubRequirement {
  return {
    id: 'r1',
    club_id: 'club-1',
    contact_id: 'c1',
    position: 'CM',
    age_min: null,
    age_max: null,
    budget_min: null,
    budget_max: null,
    salary_max: null,
    foot: null,
    needs_eu_passport: false,
    league_experience: [],
    window_target: null,
    status: 'open',
    notes: null,
    ...over,
  };
}

describe('positionMatches', () => {
  it('matches a position to itself', () => {
    expect(positionMatches(player({ position: 'CB' }), requirement({ position: 'CB' }))).toBe(true);
  });

  it('matches across a comparable cluster — a DM brief sees a CM', () => {
    expect(positionMatches(player({ position: 'CM' }), requirement({ position: 'DM' }))).toBe(true);
  });

  it('matches composite positions like DM/CM', () => {
    expect(positionMatches(player({ position: 'DM/CM' }), requirement({ position: 'AM' }))).toBe(true);
  });

  it('rejects an unrelated position', () => {
    expect(positionMatches(player({ position: 'GK' }), requirement({ position: 'CF' }))).toBe(false);
  });

  it('rejects when either side is blank', () => {
    expect(positionMatches(player({ position: '' }), requirement({ position: 'CM' }))).toBe(false);
  });
});

describe('scoreMatch', () => {
  it('returns null on a position miss rather than a low score', () => {
    // A hard filter: a non-match should not appear in a list at all.
    expect(scoreMatch(player({ position: 'GK' }), requirement({ position: 'CF' }))).toBeNull();
  });

  it('scores full marks when every stated criterion is met', () => {
    const p = player({ age: 24, marketValue: 3_000_000, trPreferredFoot: 'Left', trEuPassport: true });
    const r = requirement({ age_min: 21, age_max: 26, budget_max: 5_000_000, foot: 'Left', needs_eu_passport: true });
    expect(scoreMatch(p, r)?.score).toBe(100);
  });

  it('does not penalise a player for criteria the club never stated', () => {
    // Only a position is briefed, so the unstated factors must not drag it down.
    const p = player({ age: 31, marketValue: 40_000_000 });
    expect(scoreMatch(p, requirement())?.score).toBe(100);
  });

  it('gives partial credit just outside the age band', () => {
    const near = scoreMatch(player({ age: 28 }), requirement({ age_min: 21, age_max: 26 }));
    const far = scoreMatch(player({ age: 34 }), requirement({ age_min: 21, age_max: 26 }));
    expect(near!.score).toBeGreaterThan(far!.score);
    expect(far!.score).toBe(0);
  });

  it('treats slightly over budget as a conversation, well over as a miss', () => {
    const r = requirement({ budget_max: 10_000_000 });
    const slightly = scoreMatch(player({ marketValue: 11_000_000 }), r)!;
    const well = scoreMatch(player({ marketValue: 30_000_000 }), r)!;
    expect(slightly.score).toBeGreaterThan(well.score);
    expect(well.score).toBe(0);
  });

  it('scores the wage ceiling, not just the fee', () => {
    const cheap = player({ salaryEstimate: 800_000 });
    const dear = player({ salaryEstimate: 3_000_000 });
    const r = requirement({ salary_max: 1_000_000 });

    expect(scoreMatch(cheap, r)!.reasons.find(x => x.factor === 'salary')?.verdict).toBe('fits');
    expect(scoreMatch(dear, r)!.reasons.find(x => x.factor === 'salary')?.verdict).toBe('misses');
    expect(scoreMatch(cheap, r)!.score).toBeGreaterThan(scoreMatch(dear, r)!.score);
  });

  it('treats slightly over the wage ceiling as workable', () => {
    const r = requirement({ salary_max: 1_000_000 });
    const near = scoreMatch(player({ salaryEstimate: 1_100_000 }), r)!;
    const far = scoreMatch(player({ salaryEstimate: 5_000_000 }), r)!;
    expect(near.reasons.find(x => x.factor === 'salary')?.verdict).toBe('close');
    expect(near.score).toBeGreaterThan(far.score);
  });

  it('says nothing about salary when the club stated no ceiling', () => {
    // Silence must not invent a factor, and must not move the score — even for
    // a player on wages no club in the brief could afford.
    const p = player({ age: 24, marketValue: 2_000_000, salaryEstimate: 9_000_000 });
    const silent = scoreMatch(p, requirement({ age_min: 21, age_max: 26, budget_max: 5_000_000 }))!;

    expect(silent.reasons.find(x => x.factor === 'salary')).toBeUndefined();
    expect(silent.score).toBe(100);
  });

  it('falls back to the top of the TransferRoom band, not the bottom', () => {
    // Quoting the low end would clear a ceiling he will not actually sign for.
    const p = player({ trEstSalaryLow: 500_000, trEstSalaryHigh: 2_000_000 });
    const m = scoreMatch(p, requirement({ salary_max: 1_000_000 }))!;
    expect(m.reasons.find(x => x.factor === 'salary')?.verdict).toBe('misses');
  });

  it('marks an unknown salary as unknown rather than a miss', () => {
    const m = scoreMatch(player(), requirement({ salary_max: 1_000_000 }))!;
    expect(m.reasons.find(x => x.factor === 'salary')?.verdict).toBe('unknown');
  });

  it('prefers live xTV over the stored market value', () => {
    // xTV says €2m; market value says €50m. Budget is €3m, so xTV must win.
    const p = player({
      marketValue: 50_000_000,
      xtvHistory: [{ year: 2026, month: 6, xtv: 2_000_000 }],
    });
    const m = scoreMatch(p, requirement({ budget_max: 3_000_000 }))!;
    expect(m.reasons.find((x) => x.factor === 'budget')?.verdict).toBe('fits');
  });

  it('accepts a two-footed player for a one-footed brief', () => {
    const m = scoreMatch(player({ trPreferredFoot: 'Both' }), requirement({ foot: 'Left' }))!;
    expect(m.reasons.find((x) => x.factor === 'foot')?.verdict).toBe('fits');
  });

  it('flags a missing EU passport when the club requires one', () => {
    const m = scoreMatch(player({ trEuPassport: false }), requirement({ needs_eu_passport: true }))!;
    expect(m.reasons.find((x) => x.factor === 'eu_passport')?.verdict).toBe('misses');
  });

  it('reports unknown rather than miss when data is absent', () => {
    const m = scoreMatch(player({ age: undefined }), requirement({ age_min: 20, age_max: 30 }))!;
    expect(m.reasons.find((x) => x.factor === 'age')?.verdict).toBe('unknown');
  });

  it('explains itself — every scored factor carries a reason', () => {
    const r = requirement({ age_min: 20, age_max: 30, budget_max: 5_000_000, foot: 'Right' });
    const m = scoreMatch(player({ age: 25, marketValue: 1_000_000, trPreferredFoot: 'Right' }), r)!;
    expect(m.reasons.map((x) => x.factor).sort()).toEqual(['age', 'budget', 'foot']);
    expect(m.reasons.every((x) => x.detail.length > 0)).toBe(true);
  });
});

describe('matchRosterToRequirement', () => {
  const roster = [
    player({ id: 'a', position: 'CM', age: 24, marketValue: 2_000_000 }),
    player({ id: 'b', position: 'CM', age: 33, marketValue: 20_000_000 }),
    player({ id: 'c', position: 'GK', age: 24 }),
  ];

  it('excludes position misses and ranks the rest best-first', () => {
    const out = matchRosterToRequirement(roster, requirement({ age_min: 21, age_max: 26, budget_max: 5_000_000 }));
    expect(out.map((m) => m.playerId)).toEqual(['a', 'b']);
    expect(out[0].score).toBeGreaterThan(out[1].score);
  });

  it('returns nothing for a requirement that is no longer open', () => {
    expect(matchRosterToRequirement(roster, requirement({ status: 'filled' }))).toEqual([]);
  });
});

describe('matchRequirementsToPlayer', () => {
  it('considers only open requirements', () => {
    const reqs = [
      requirement({ id: 'open-1', status: 'open' }),
      requirement({ id: 'filled-1', status: 'filled' }),
      requirement({ id: 'withdrawn-1', status: 'withdrawn' }),
    ];
    const out = matchRequirementsToPlayer(reqs, player());
    expect(out.map((m) => m.requirementId)).toEqual(['open-1']);
  });
});

describe('unmatchableFields', () => {
  it('names hand-filled fields so the desk can see what was ignored', () => {
    const p = player({
      contractEndDate: '2027-06-30',
      dataProvenance: { contractEndDate: 'placeholder', marketValue: 'transfermarkt' },
    });
    expect(unmatchableFields(p)).toContain('contractEndDate');
    expect(unmatchableFields(p)).not.toContain('marketValue');
  });

  it('treats an unrecorded provenance as placeholder, not as fact', () => {
    // Absent means unknown, and unknown must not be trusted as sourced.
    expect(unmatchableFields(player())).toContain('contractEndDate');
  });
});
