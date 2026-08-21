import { describe, it, expect } from 'vitest';
import { toRosterPlayer } from './rosterMapping';
import { getAge, getLatestXtvM, hasCommercialData, hasMandateData, isPrintable, parsePlayerDob, provenanceOf } from './rosterData';
import type { ScoutedTarget } from '@/hooks/useBuyData';

/**
 * The row shape is wide and mostly irrelevant here; each test states only the
 * columns it is about.
 */
const row = (over: Partial<ScoutedTarget> = {}): ScoutedTarget =>
  ({
    id: 'id-1',
    slug: 'a-player',
    name: 'A Player',
    position: 'CB',
    current_club: '',
    league: '',
    ...over,
  }) as ScoutedTarget;

describe('toRosterPlayer', () => {
  it('keeps the parent and loan deals apart', () => {
    const p = toRosterPlayer(
      row({
        tenure: 'loan',
        owner_club: 'Vasco da Gama',
        owner_league: 'Série A',
        current_club: 'Nottingham Forest',
        league: 'Premier League',
        loan_club: 'Nottingham Forest',
        loan_league: 'Premier League',
        contract_end: '2029-12-31',
        loan_contract_end: '2026-06-30',
      } as Partial<ScoutedTarget>),
    );

    expect(p.ownerClub).toBe('Vasco da Gama');
    // Who he turns out for, which is not who holds the registration.
    expect(p.currentClub).toBe('Nottingham Forest');
    expect(p.contractEndDate).toBe('2029-12-31');
    expect(p.loanContractEnd).toBe('2026-06-30');
    expect(p.contractEndDate).not.toBe(p.loanContractEnd);
  });

  it("reads a free agent's empty club as absent, not as a club named ''", () => {
    const p = toRosterPlayer(row({ tenure: 'free_agent', current_club: '', league: '' } as Partial<ScoutedTarget>));
    expect(p.currentClub).toBeUndefined();
    expect(p.league).toBeUndefined();
    expect(p.tenure).toBe('free_agent');
  });

  it('survives a tr_data payload that is null, a string, or half-populated', () => {
    expect(() => toRosterPlayer(row({ tr_data: null } as Partial<ScoutedTarget>))).not.toThrow();
    expect(() => toRosterPlayer(row({ tr_data: 'nonsense' } as unknown as Partial<ScoutedTarget>))).not.toThrow();

    const p = toRosterPlayer(row({ tr_data: { xtvHistory: [{ year: 2025 }, { year: 2025, month: 6, xtv: 4.2 }] } } as unknown as Partial<ScoutedTarget>));
    // The incomplete entry is dropped rather than charted as a zero.
    expect(p.xtvHistory).toEqual([{ year: 2025, month: 6, xtv: 4.2 }]);
  });

  it('accepts either camelCase or snake_case inside tr_data', () => {
    const camel = toRosterPlayer(row({ tr_data: { xtvChange6m: 12 } } as unknown as Partial<ScoutedTarget>));
    const snake = toRosterPlayer(row({ tr_data: { xtv_change_6m: 12 } } as unknown as Partial<ScoutedTarget>));
    expect(camel.trXtvChange6m).toBe(12);
    expect(snake.trXtvChange6m).toBe(12);
  });
});

describe('provenance', () => {
  it('treats an unrecorded field as a placeholder', () => {
    const p = toRosterPlayer(row({ contract_end: '2027-06-30' } as Partial<ScoutedTarget>));
    expect(provenanceOf(p, 'contractEndDate')).toBe('placeholder');
    expect(isPrintable(p, 'contractEndDate')).toBe(false);
  });

  it('lets a recorded field print', () => {
    const p = toRosterPlayer(
      row({ contract_end: '2027-06-30', data_provenance: { contractEndDate: 'verified' } } as unknown as Partial<ScoutedTarget>),
    );
    expect(isPrintable(p, 'contractEndDate')).toBe(true);
  });
});

describe('dates of birth', () => {
  // A missing date of birth is the normal state of a freshly imported roster,
  // not an error. These used to throw, which blanked the whole page.
  it('returns nothing rather than throwing when there is no date', () => {
    expect(parsePlayerDob(undefined)).toBeNull();
    expect(parsePlayerDob(null)).toBeNull();
    expect(parsePlayerDob('')).toBeNull();
    expect(getAge(undefined)).toBeUndefined();
  });

  it('rejects a date it cannot read instead of inventing one', () => {
    expect(parsePlayerDob('not a date')).toBeNull();
    expect(getAge('not a date')).toBeUndefined();
  });

  it('reads both the stored and the legacy format as the same day', () => {
    expect(parsePlayerDob('1998-03-14')?.getFullYear()).toBe(1998);
    expect(parsePlayerDob('1998-03-14')?.getMonth()).toBe(2);
    expect(parsePlayerDob('14/03/1998')?.getTime()).toBe(parsePlayerDob('1998-03-14')?.getTime());
  });
});

describe('section gating', () => {
  it('does not claim a mandate just because a club contract is known', () => {
    const p = toRosterPlayer(row({ contract_end: '2027-06-30' } as Partial<ScoutedTarget>));
    expect(hasMandateData(p)).toBe(false);
    // ...but there is still something to put in a document.
    expect(hasCommercialData(p)).toBe(true);
  });

  it('opens the commercial block for a loan player with only a loan end', () => {
    const p = toRosterPlayer(row({ tenure: 'loan', loan_contract_end: '2026-06-30' } as Partial<ScoutedTarget>));
    expect(hasCommercialData(p)).toBe(true);
  });

  it('recognises our own terms', () => {
    const p = toRosterPlayer(row({ commission_pct: 10 } as unknown as Partial<ScoutedTarget>));
    expect(hasMandateData(p)).toBe(true);
  });
});

describe('TransferRoom field casing', () => {
  // tr_data is TransferRoom's own response, stored verbatim, and it is
  // PascalCase. Reading only camelCase left every dossier section empty.
  it('reads PascalCase as the API actually returns it', () => {
    const p = toRosterPlayer(row({
      tr_data: {
        GBEScore: 15,
        GBEResult: 'Pass',
        PreferredFoot: 'Left',
        PlayingStyle: 'Deep-lying playmaker',
        Rating: 78,
      },
    } as unknown as Partial<ScoutedTarget>));

    expect(p.trGbeScore).toBe(15);
    expect(p.trGbeResult).toBe('Pass');
    expect(p.trPreferredFoot).toBe('Left');
    expect(p.trPlayingStyle).toBe('Deep-lying playmaker');
    expect(p.trRating).toBe(78);
  });

  it('reads a PascalCase transfer history', () => {
    const p = toRosterPlayer(row({
      tr_data: {
        TransferHistory: [
          { FromTeam: 'Fluminense', ToTeam: 'Corinthians', Date: '2023-07-01', Fee: 4000000, TransferType: 'Permanent' },
        ],
      },
    } as unknown as Partial<ScoutedTarget>));

    expect(p.transferHistory).toHaveLength(1);
    expect(p.transferHistory[0].fromTeam).toBe('Fluminense');
    expect(p.transferHistory[0].fee).toBe(4_000_000);
  });

  it('still reads camelCase and snake_case', () => {
    const camel = toRosterPlayer(row({ tr_data: { gbeScore: 9 } } as unknown as Partial<ScoutedTarget>));
    const snake = toRosterPlayer(row({ tr_data: { gbe_score: 9 } } as unknown as Partial<ScoutedTarget>));
    expect(camel.trGbeScore).toBe(9);
    expect(snake.trGbeScore).toBe(9);
  });
});

describe('xTV units', () => {
  it('reports millions from a figure stored in euros', () => {
    const p = toRosterPlayer(row({ xtv: 4_200_000 } as unknown as Partial<ScoutedTarget>));
    expect(getLatestXtvM(p)).toBeCloseTo(4.2);
  });

  it('reports millions from history entries too', () => {
    const p = toRosterPlayer(row({
      xtv: 1_000_000,
      tr_data: { xtvHistory: [{ year: 2026, month: 6, xtv: 5_500_000 }] },
    } as unknown as Partial<ScoutedTarget>));
    expect(getLatestXtvM(p)).toBeCloseTo(5.5);
  });
});
