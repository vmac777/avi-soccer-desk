import { describe, it, expect } from 'vitest';
import {
  positionMatches,
  positionLabel,
  isPricedOut,
  isUnderBand,
  isOutsideFeeBand,
  feeBandLabel,
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
  const matches = (playerPos: string, briefPos: string) =>
    positionMatches(player({ position: playerPos }), requirement({ position: briefPos }));

  it('matches a position to itself', () => {
    expect(matches('CB', 'CB')).toBe(true);
  });

  it('collapses labels for the same job', () => {
    expect(matches('ST', 'CF')).toBe(true);
    expect(matches('FW', 'CF')).toBe(true);
    expect(matches('CDM', 'DM')).toBe(true);
    expect(matches('CAM', 'AM')).toBe(true);
  });

  it('matches a player on any position he is listed at', () => {
    // "DM/CM" plays both; a club asking for either should see him.
    expect(matches('DM/CM', 'CM')).toBe(true);
    expect(matches('CB/RB', 'RB')).toBe(true);
  });

  it('does not return a centre-forward for an attacking-midfield brief', () => {
    // The reported bug. SS sits with CF and pointedly not with AM — if it sat
    // in both, AM≈SS and CF≈SS would bridge into AM≈CF all over again.
    expect(matches('CF', 'AM')).toBe(false);
    expect(matches('SS', 'AM')).toBe(false);
    expect(matches('AM', 'CF')).toBe(false);
  });

  it('keeps full backs on their own side', () => {
    // A club that needs a left back does not want a right back, whatever the
    // transfer-comparables map says about their fees being alike.
    expect(matches('RB', 'LB')).toBe(false);
    expect(matches('LWB', 'LB')).toBe(true);
    expect(matches('RWB', 'RB')).toBe(true);
    expect(matches('LWB', 'RB')).toBe(false);
  });

  it('treats wingers as one wide bucket, either flank', () => {
    // Inverted wingers swap sides as a matter of course, so unlike full backs
    // these are deliberately not lateral.
    expect(matches('LW', 'RW')).toBe(true);
    expect(matches('LM', 'RW')).toBe(true);
    expect(matches('RM', 'LW')).toBe(true);
  });

  it('puts the second striker with the forwards', () => {
    expect(matches('SS', 'CF')).toBe(true);
    expect(matches('CF', 'SS')).toBe(true);
  });

  it('lets a holding midfielder answer a central-midfield brief', () => {
    expect(matches('DM', 'CM')).toBe(true);
    expect(matches('CM', 'DM')).toBe(true);
  });

  it('keeps the ten out of central midfield', () => {
    expect(matches('AM', 'CM')).toBe(false);
    expect(matches('CM', 'AM')).toBe(false);
  });

  it('rejects an unrelated position', () => {
    expect(matches('GK', 'CF')).toBe(false);
  });

  it('rejects when either side is blank', () => {
    expect(matches('', 'CM')).toBe(false);
    expect(matches('CM', '')).toBe(false);
  });
});

describe('isPricedOut', () => {
  const at = (valueEur: number, budget: number | null) =>
    scoreMatch(player({ marketValue: valueEur }), requirement({ budget_max: budget }))!;

  it('is true only beyond the negotiable band', () => {
    expect(isPricedOut(at(30_000_000, 10_000_000))).toBe(true);
  });

  it('leaves a player just over budget in the list', () => {
    // Four million often does four-eight with add-ons. Hiding that band would
    // hide real deals, so `close` is not priced out.
    expect(isPricedOut(at(11_000_000, 10_000_000))).toBe(false);
  });

  it('never prices out a player we hold no valuation for', () => {
    // Not knowing what he is worth is not evidence that he is too dear, and
    // hiding him would quietly shrink the roster to only the enriched players.
    const m = scoreMatch(player(), requirement({ budget_max: 1_000_000 }))!;
    expect(isPricedOut(m)).toBe(false);
  });

  it('is false when the club stated no ceiling', () => {
    expect(isPricedOut(at(80_000_000, null))).toBe(false);
  });

  it('does not call a cheap player priced out', () => {
    // The distinction the `direction` marker exists for. Both are misses, but
    // filing a €350k player under "priced out" is the reverse of the truth.
    const m = scoreMatch(
      player({ marketValue: 350_000 }),
      requirement({ budget_min: 5_000_000, budget_max: 10_000_000 }),
    )!;
    expect(isPricedOut(m)).toBe(false);
    expect(isUnderBand(m)).toBe(true);
    expect(isOutsideFeeBand(m)).toBe(true);
  });
});

describe('the fee band', () => {
  const against = (valueEur: number, band: { min?: number | null; max?: number | null }) =>
    scoreMatch(
      player({ marketValue: valueEur }),
      requirement({ budget_min: band.min ?? null, budget_max: band.max ?? null }),
    )!;
  const budget = (m: ReturnType<typeof against>) =>
    m.reasons.find((r) => r.factor === 'budget')!;

  it('rejects a player well under the level the club named', () => {
    // The bug this exists for: `budget_min` was written to the database as null
    // on every save and read by nothing, so a €350k right-back cleared a €10m
    // ask and came back at the top of the shortlist.
    const m = against(350_000, { min: 5_000_000, max: 10_000_000 });
    expect(budget(m).verdict).toBe('misses');
    expect(budget(m).direction).toBe('under');
    expect(budget(m).detail).toBe('€350k, well under €5.0m–€10.0m');
  });

  it('takes a floor on its own seriously', () => {
    const m = against(350_000, { min: 5_000_000 });
    expect(budget(m).verdict).toBe('misses');
    expect(isUnderBand(m)).toBe(true);
  });

  it('accepts a player inside the band and names it', () => {
    const m = against(7_000_000, { min: 5_000_000, max: 10_000_000 });
    expect(budget(m).verdict).toBe('fits');
    expect(budget(m).detail).toBe('€7.0m within €5.0m–€10.0m');
  });

  it('counts the floor itself as inside', () => {
    expect(budget(against(5_000_000, { min: 5_000_000, max: 10_000_000 })).verdict).toBe('fits');
  });

  it('leaves a ceiling-only requirement exactly as it was', () => {
    // Every requirement saved before today has budget_min null. If this drifts,
    // the change has quietly rewritten the desk's existing needs.
    const m = against(7_000_000, { max: 10_000_000 });
    expect(budget(m).verdict).toBe('fits');
    expect(budget(m).detail).toBe('€7.0m within €10.0m');
    expect(budget(m).direction).toBeUndefined();
  });

  it('marks an over-budget miss as over', () => {
    const m = against(30_000_000, { max: 10_000_000 });
    expect(budget(m).direction).toBe('over');
    expect(isPricedOut(m)).toBe(true);
    expect(isUnderBand(m)).toBe(false);
  });

  it('never rejects a player for being cheap when we do not know his value', () => {
    const m = scoreMatch(player(), requirement({ budget_min: 5_000_000 }))!;
    expect(budget(m).verdict).toBe('unknown');
    expect(isUnderBand(m)).toBe(false);
  });
});

describe('feeBandLabel', () => {
  it('states both ends when the club gave both', () => {
    expect(feeBandLabel({ budget_min: 5_000_000, budget_max: 10_000_000 })).toBe('€5.0m–€10.0m');
  });
  it('states whichever end it has', () => {
    expect(feeBandLabel({ budget_min: null, budget_max: 10_000_000 })).toBe('≤ €10.0m');
    expect(feeBandLabel({ budget_min: 5_000_000, budget_max: null })).toBe('≥ €5.0m');
  });
  it('is null when the club named no figure', () => {
    expect(feeBandLabel({ budget_min: null, budget_max: null })).toBeNull();
  });
});

describe('positionLabel', () => {
  it('says the word an agent uses for the position the matcher already had', () => {
    // ST has bucketed to CF since the position rules were written; the picker
    // simply never said so, so a striker looked impossible to ask for.
    expect(positionLabel('CF')).toBe('ST / CF');
    expect(positionMatches(player({ position: 'ST' }), requirement({ position: 'CF' }))).toBe(true);
  });

  it('leaves every other code alone', () => {
    expect(positionLabel('CB')).toBe('CB');
    expect(positionLabel('LWB')).toBe('LWB');
  });

  it('still renders a code that is no longer offered', () => {
    // Requirements saved as SS before the chip was folded into ST / CF.
    expect(positionLabel('SS')).toBe('SS');
  });

  it('never renders empty', () => {
    expect(positionLabel(null)).toBe('');
    expect(positionLabel('')).toBe('');
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
