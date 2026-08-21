import { describe, it, expect } from 'vitest';
import { buildBoard, rosterCoverage, type BoardInput } from './deskBoard';
import type { ClubRequirement } from './matching';
import type { RosterPlayer } from './rosterData';

/**
 * Every card is a claim about a client's business, made to his face.
 *
 * So these tests are weighted toward silence rather than output: the failure
 * that matters is not a missing card, it is a card asserting something that is
 * not true. "Three of yours fit" had better mean three he can actually sign.
 */

const TODAY = '2026-08-21';

const player = (over: Partial<RosterPlayer> = {}): RosterPlayer => ({
  id: 'p1',
  slug: 'p1',
  name: 'A Player',
  position: 'CM',
  trEuPassport: false,
  xtvHistory: [],
  transferHistory: [],
  dataProvenance: {},
  ...over,
});

const need = (over: Partial<ClubRequirement> = {}): ClubRequirement => ({
  id: 'r1',
  club_id: 'club-1',
  contact_id: null,
  position: 'CM',
  age_min: null, age_max: null,
  budget_min: null, budget_max: null,
  salary_max: null,
  foot: null,
  needs_eu_passport: false,
  league_experience: [],
  window_target: null,
  status: 'open',
  notes: null,
  ...over,
});

const input = (over: Partial<BoardInput> = {}): BoardInput => ({
  requirements: [],
  shortlistEntries: [],
  roster: [],
  pitches: [],
  contacts: [],
  clubNames: { 'club-1': 'Palmeiras' },
  contactClubs: {},
  today: TODAY,
  ...over,
});

const kinds = (i: BoardInput) => buildBoard(i).map((o) => o.kind);

describe('buildBoard — an empty desk', () => {
  it('says nothing at all rather than hedging', () => {
    expect(buildBoard(input())).toEqual([]);
  });
});

describe('unworked match', () => {
  it('fires when a club wants what we hold and nobody was sent', () => {
    const board = buildBoard(input({
      requirements: [need()],
      roster: [player({ name: 'Danilo' })],
    }));
    expect(board).toHaveLength(1);
    expect(board[0].headline).toContain('Palmeiras');
    expect(board[0].detail).toContain('1 of yours fits');
    expect(board[0].href).toBe('/needs/r1');
  });

  it('stays silent once somebody is on the shortlist', () => {
    expect(kinds(input({
      requirements: [need()],
      roster: [player()],
      shortlistEntries: [{ requirement_id: 'r1', scouted_target_id: 'p1' }],
    }))).not.toContain('unworked_match');
  });

  it('stays silent when nobody plays the position', () => {
    expect(kinds(input({
      requirements: [need({ position: 'GK' })],
      roster: [player({ position: 'CM' })],
    }))).not.toContain('unworked_match');
  });

  it('does not count a player the club could never afford', () => {
    // The whole credibility of the sentence. "Three of yours fit" has to mean
    // three he can sign, not three who play there.
    const board = buildBoard(input({
      requirements: [need({ budget_max: 2_000_000 })],
      roster: [
        player({ id: 'cheap', name: 'Cheap', marketValue: 1_000_000 }),
        player({ id: 'dear', name: 'Dear', marketValue: 80_000_000 }),
      ],
    }));
    expect(board[0].detail).toContain('1 of yours fits');
  });

  it('ignores needs that are filled or withdrawn', () => {
    expect(kinds(input({
      requirements: [need({ status: 'filled' }), need({ id: 'r2', status: 'withdrawn' })],
      roster: [player()],
    }))).toEqual([]);
  });
});

describe('ball in court', () => {
  it('counts only live pitches stalled on us', () => {
    const board = buildBoard(input({
      roster: [player({ name: 'Danilo' })],
      pitches: [
        { id: 'a', scouted_target_id: 'p1', stage: 'Negotiation', ball_in_court: 'us', updated_at: '2026-08-11T00:00:00Z' },
        { id: 'b', scouted_target_id: 'p1', stage: 'Negotiation', ball_in_court: 'selling', updated_at: '2026-08-01T00:00:00Z' },
        { id: 'c', scouted_target_id: 'p1', stage: 'Signed', ball_in_court: 'us', updated_at: '2026-08-01T00:00:00Z' },
      ],
    }));
    const card = board.find((o) => o.kind === 'ball_in_court')!;
    expect(card.headline).toContain('One placement');
    expect(card.headline).toContain('Danilo');
    expect(card.detail).toContain('10 days');
  });

  it('sorts above everything else, because it is the only queue we control', () => {
    const board = buildBoard(input({
      requirements: [need()],
      roster: [player()],
      pitches: [{ id: 'a', scouted_target_id: 'zzz', stage: 'Enquiry', ball_in_court: 'us', updated_at: '2026-08-20T00:00:00Z' }],
    }));
    expect(board[0].kind).toBe('ball_in_court');
  });
});

describe('contract clock', () => {
  it('fires inside twelve months', () => {
    const board = buildBoard(input({
      roster: [player({ name: 'Alerrandro', contractEndDate: '2027-01-21', currentClub: 'Vitória' })],
    }));
    const card = board.find((o) => o.kind === 'contract_clock')!;
    expect(card.headline).toContain('Alerrandro');
    expect(card.headline).toContain('5 months');
    expect(card.href).toBe('/roster/p1');
  });

  it('says nothing about a player with no contract date', () => {
    // Absence of a date is not a short contract. Inventing one would be the
    // worst kind of wrong: plausible and unverifiable.
    expect(kinds(input({ roster: [player()] }))).not.toContain('contract_clock');
  });

  it('says nothing about a contract years away', () => {
    expect(kinds(input({
      roster: [player({ contractEndDate: '2030-01-01' })],
    }))).not.toContain('contract_clock');
  });

  it('says nothing when the player is already being worked', () => {
    expect(kinds(input({
      roster: [player({ contractEndDate: '2026-11-01' })],
      pitches: [{ id: 'a', scouted_target_id: 'p1', stage: 'Negotiation', ball_in_court: 'selling', updated_at: '2026-08-01T00:00:00Z' }],
    }))).not.toContain('contract_clock');
  });

  it('ignores a contract that already expired', () => {
    expect(kinds(input({
      roster: [player({ contractEndDate: '2026-01-01' })],
    }))).not.toContain('contract_clock');
  });
});

describe('quiet club', () => {
  const quiet = (days: number) => input({
    requirements: [need()],
    contacts: [{ id: 'c1', club: 'Palmeiras', days_since_contact: days }],
  });

  it('fires when a club with open needs has gone cold', () => {
    const card = buildBoard(quiet(94)).find((o) => o.kind === 'quiet_club')!;
    expect(card.headline).toContain('Palmeiras have 1 open need');
    expect(card.headline).toContain('94 days');
  });

  it('stays quiet when somebody spoke to them recently', () => {
    expect(kinds(quiet(5))).not.toContain('quiet_club');
  });

  it('reads the warmest contact, not the coldest', () => {
    // One colleague nobody rings does not make the relationship cold.
    expect(kinds(input({
      requirements: [need()],
      contacts: [
        { id: 'c1', club: 'Palmeiras', days_since_contact: 300 },
        { id: 'c2', club: 'Palmeiras', days_since_contact: 3 },
      ],
    }))).not.toContain('quiet_club');
  });

  it('says nothing when we have never contacted them at all', () => {
    // No date is not a long gap — it is a club we have never worked, which is
    // a different card and not this one.
    expect(kinds(input({
      requirements: [need()],
      contacts: [{ id: 'c1', club: 'Palmeiras', days_since_contact: null }],
    }))).not.toContain('quiet_club');
  });
});

describe('value moved', () => {
  const rising = player({
    name: 'Danilo',
    xtvHistory: [
      { year: 2026, month: 2, xtv: 10_000_000 },
      { year: 2026, month: 8, xtv: 14_000_000 },
    ],
  });

  it('fires when a rising player fits an open need', () => {
    const card = buildBoard(input({ requirements: [need()], roster: [rising] }))
      .find((o) => o.kind === 'value_moved')!;
    expect(card.headline).toContain('Danilo is up 40%');
    expect(card.detail).toContain('1 open need');
  });

  it('says nothing when no club wants that profile', () => {
    expect(kinds(input({ roster: [rising] }))).not.toContain('value_moved');
  });

  it('ignores a move too small to be news', () => {
    expect(kinds(input({
      requirements: [need()],
      roster: [player({ xtvHistory: [
        { year: 2026, month: 2, xtv: 10_000_000 },
        { year: 2026, month: 8, xtv: 10_500_000 },
      ] })],
    }))).not.toContain('value_moved');
  });
});

describe('deadline near', () => {
  it('fires inside three weeks and counts down', () => {
    const card = buildBoard(input({
      roster: [player({ name: 'Danilo' })],
      pitches: [{ id: 'a', scouted_target_id: 'p1', stage: 'Closing', ball_in_court: 'buying', deadline: '2026-08-28', updated_at: '2026-08-20T00:00:00Z' }],
    })).find((o) => o.kind === 'deadline_near')!;
    expect(card.headline).toContain('7 days');
  });

  it('ignores a deadline already passed', () => {
    expect(kinds(input({
      pitches: [{ id: 'a', scouted_target_id: 'p1', stage: 'Closing', ball_in_court: null, deadline: '2026-08-01', updated_at: '2026-08-01T00:00:00Z' }],
    }))).not.toContain('deadline_near');
  });

  it('ignores a pitch that is already closed', () => {
    expect(kinds(input({
      pitches: [{ id: 'a', scouted_target_id: 'p1', stage: 'Signed', ball_in_court: null, deadline: '2026-08-25', updated_at: '2026-08-01T00:00:00Z' }],
    }))).not.toContain('deadline_near');
  });
});

describe('ranking', () => {
  it('puts the time-critical above the merely useful', () => {
    const board = buildBoard(input({
      requirements: [need()],
      roster: [player({ contractEndDate: '2026-11-01' })],
      contacts: [{ id: 'c1', club: 'Palmeiras', days_since_contact: 200 }],
      pitches: [
        { id: 'a', scouted_target_id: 'zzz', stage: 'Negotiation', ball_in_court: 'us', updated_at: '2026-08-19T00:00:00Z' },
        { id: 'b', scouted_target_id: 'zzz', stage: 'Closing', ball_in_court: 'buying', deadline: '2026-08-23', updated_at: '2026-08-19T00:00:00Z' },
      ],
    }));
    expect(board.map((o) => o.kind).slice(0, 2)).toEqual(['ball_in_court', 'deadline_near']);
    expect(board.every((o, i, all) => i === 0 || all[i - 1].urgency >= o.urgency)).toBe(true);
  });

  it('gives every card a stable id, so keys do not thrash', () => {
    const i = input({ requirements: [need()], roster: [player()] });
    expect(buildBoard(i).map((o) => o.id)).toEqual(buildBoard(i).map((o) => o.id));
  });
});

describe('rosterCoverage', () => {
  it('counts a player enriched if either source landed', () => {
    expect(rosterCoverage([
      { tm_status: 'ok', tr_status: 'failed' },
      { tm_status: 'failed', tr_status: 'ok' },
      { tm_status: 'pending', tr_status: 'pending' },
      { tm_status: null, tr_status: null },
    ])).toEqual({ total: 4, enriched: 2, missing: 2 });
  });
});
