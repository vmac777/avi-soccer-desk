import { describe, it, expect } from 'vitest';
import {
  needsNobodyPitched, totalUnpitchedFits, playerInitials,
  type BoardInput, type DatedRequirement,
} from './deskBoard';
import type { RosterPlayer } from './rosterData';

/**
 * The board now leads with these cards and shows the evidence behind each one,
 * so the failure that matters is not a missing card — it is a line an agent
 * reads to a sporting director that we made up. Every verdict here has to be
 * traceable to a scorer reason or a fact on the row.
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

const need = (over: Partial<DatedRequirement> = {}): DatedRequirement => ({
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
  clubNames: { 'club-1': 'Palmeiras', 'club-2': 'Bahia', 'club-3': 'Grêmio' },
  contactClubs: {},
  today: TODAY,
  ...over,
});

describe('needsNobodyPitched — what it stays quiet about', () => {
  it('says nothing on an empty desk', () => {
    expect(needsNobodyPitched(input())).toEqual([]);
  });

  it('drops a need nobody of ours fits, rather than showing an empty card', () => {
    const out = needsNobodyPitched(input({
      requirements: [need({ position: 'GK' })],
      roster: [player({ position: 'CM' })],
    }));
    expect(out).toEqual([]);
  });

  it('drops a need that has already been shortlisted', () => {
    const out = needsNobodyPitched(input({
      requirements: [need()],
      roster: [player()],
      shortlistEntries: [{ requirement_id: 'r1', scouted_target_id: 'p1' }],
    }));
    expect(out).toEqual([]);
  });

  it('drops a need that is filled or withdrawn', () => {
    for (const status of ['filled', 'withdrawn'] as const) {
      expect(needsNobodyPitched(input({
        requirements: [need({ status })],
        roster: [player()],
      }))).toEqual([]);
    }
  });
});

describe('needsNobodyPitched — oldest ask first', () => {
  const three = () => input({
    requirements: [
      need({ id: 'new', club_id: 'club-1', created_at: '2026-08-20T00:00:00Z' }),
      need({ id: 'old', club_id: 'club-2', created_at: '2026-07-01T00:00:00Z' }),
      need({ id: 'mid', club_id: 'club-3', created_at: '2026-08-01T00:00:00Z' }),
    ],
    roster: [player()],
  });

  it('puts the club that has waited longest at the top', () => {
    // The old ordering was by fit count, which put the easiest conversation
    // first and left the club waiting seven weeks at the bottom.
    expect(needsNobodyPitched(three()).map((n) => n.requirementId))
      .toEqual(['old', 'mid', 'new']);
  });

  it('reports how long they have waited', () => {
    const [oldest] = needsNobodyPitched(three());
    expect(oldest.askedDaysAgo).toBe(51);
  });

  it('sorts a need with no recorded date last, and shows no age for it', () => {
    // An unknown ask date is not an old one. Ranking it first would put the
    // least-known need at the top of the queue.
    const out = needsNobodyPitched(input({
      requirements: [
        need({ id: 'undated', club_id: 'club-1' }),
        need({ id: 'dated', club_id: 'club-2', created_at: '2026-08-01T00:00:00Z' }),
      ],
      roster: [player()],
    }));
    expect(out.map((n) => n.requirementId)).toEqual(['dated', 'undated']);
    expect(out[1].askedDaysAgo).toBeNull();
  });
});

describe('needsNobodyPitched — the fit rows', () => {
  // xtvHistory carries EUR, not millions — getLatestXtvM divides. Writing 27
  // here means twenty-seven euros, and every player clears every budget.
  const withBudget = () => input({
    requirements: [need({ budget_max: 30_000_000, created_at: '2026-08-01T00:00:00Z' })],
    roster: [
      player({ id: 'cheap', name: 'Ana Costa', xtvHistory: [{ year: 2026, month: 8, xtv: 27_000_000 }] }),
      player({ id: 'dear', name: 'Bruno Reis', xtvHistory: [{ year: 2026, month: 8, xtv: 90_000_000 }] }),
    ],
  });

  it('carries every player it considered, those who fit first', () => {
    const [n] = needsNobodyPitched(withBudget());
    expect(n.rows.map((r) => r.playerId)).toEqual(['cheap', 'dear']);
    expect(n.rows.map((r) => r.ok)).toEqual([true, false]);
    expect(n.fitCount).toBe(1);
  });

  it('quotes the scorer rather than composing a new sentence', () => {
    const [n] = needsNobodyPitched(withBudget());
    // These strings come from `scoreBudget`'s own `detail`. If the wording
    // ever changes there, it must change here — not be re-derived.
    expect(n.rows[0].verdict).toBe('€27.0m within €30.0m');
    expect(n.rows[1].verdict).toBe('€90.0m over €30.0m');
  });

  it('says he is already at the club before it says anything else', () => {
    const [n] = needsNobodyPitched(input({
      requirements: [need({ budget_max: 30_000_000 })],
      roster: [player({ name: 'Ana', currentClub: 'Palmeiras', xtvHistory: [{ year: 2026, month: 8, xtv: 5_000_000 }] })],
    }));
    expect(n.rows[0].verdict).toBe('already at Palmeiras');
  });

  it('adds the contract runway when we hold the date, and nothing when we do not', () => {
    const [withDate] = needsNobodyPitched(input({
      requirements: [need({ budget_max: 30_000_000 })],
      roster: [player({ xtvHistory: [{ year: 2026, month: 8, xtv: 5_000_000 }], contractEndDate: '2026-11-19' })],
    }));
    expect(withDate.rows[0].verdict).toBe('€5.0m within €30.0m · 3m contract left');

    const [without] = needsNobodyPitched(input({
      requirements: [need({ budget_max: 30_000_000 })],
      roster: [player({ xtvHistory: [{ year: 2026, month: 8, xtv: 5_000_000 }] })],
    }));
    expect(without.rows[0].verdict).toBe('€5.0m within €30.0m');
  });

  it('leaves the value null rather than guessing one', () => {
    const [n] = needsNobodyPitched(input({
      requirements: [need()],
      roster: [player({ name: 'No Valuation' })],
    }));
    expect(n.rows[0].value).toBeNull();
  });
});

describe('needsNobodyPitched — one card per club', () => {
  it('does not stack two needs at the same club', () => {
    const out = needsNobodyPitched(input({
      requirements: [
        need({ id: 'r1', club_id: 'club-1', created_at: '2026-08-01T00:00:00Z' }),
        need({ id: 'r2', club_id: 'club-1', created_at: '2026-08-02T00:00:00Z' }),
      ],
      roster: [player()],
    }));
    expect(out).toHaveLength(1);
    expect(out[0].alsoAtClub).toBe(1);
  });

  it('caps the list', () => {
    const out = needsNobodyPitched(input({
      requirements: Array.from({ length: 9 }, (_, i) =>
        need({ id: `r${i}`, club_id: `club-${i}`, created_at: `2026-08-0${i + 1}T00:00:00Z` })),
      roster: [player()],
      clubNames: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`club-${i}`, `Club ${i}`])),
    }), 4);
    expect(out).toHaveLength(4);
  });
});

describe('totalUnpitchedFits', () => {
  it('is the numeral in the hero line', () => {
    const needs = needsNobodyPitched(input({
      requirements: [
        need({ id: 'r1', club_id: 'club-1', created_at: '2026-08-01T00:00:00Z' }),
        need({ id: 'r2', club_id: 'club-2', created_at: '2026-08-02T00:00:00Z' }),
      ],
      roster: [player({ id: 'a', name: 'A A' }), player({ id: 'b', name: 'B B' })],
    }));
    expect(totalUnpitchedFits(needs)).toBe(4);
    expect(totalUnpitchedFits([])).toBe(0);
  });
});

describe('playerInitials', () => {
  it('takes first and last', () => {
    expect(playerInitials('Gabriel Magalhães')).toBe('GM');
    expect(playerInitials('Luiz Henrique Silva')).toBe('LS');
  });
  it('copes with one name and with none', () => {
    expect(playerInitials('Vinícius')).toBe('VI');
    expect(playerInitials('   ')).toBe('—');
  });
});
