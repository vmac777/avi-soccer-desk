import { describe, it, expect } from 'vitest';
import {
  BUY_ACTIVE_STAGES,
  BUY_CLOSED_STAGES,
  BUY_ALL_STAGES,
  BUY_ER_BANDS,
  CLOSED_STAGE_TO_LOSS_REASON,
  ENTRY_TYPES_BY_SIDE,
  NEUTRAL_ENTRY_TYPE,
  NEGOTIATION_TYPES,
  LOAN_TYPES_WITH_TRIGGER,
} from './useBuyData';
import { SELLING_TRACK, BUYING_TRACK, PLAYER_TRACK, TRACK_LABELS } from '@/lib/placementStage';

/**
 * "Added a value, forgot the lookup table."
 *
 * This is the failure this file exists for. The stage model and the three
 * negotiation ladders are each a list plus two or three maps keyed off it, and
 * every time a rung was added somewhere a map was missed — a red-team pass on
 * this module found a TRACK_LABELS gap that would have rendered `undefined` in
 * the pitch panel. TypeScript catches it where the map is typed `Record<Union,
 * …>` and cannot where the key type is `string`, which is most of them.
 *
 * None of these test behaviour. They assert the tables are complete, which is
 * the property that keeps breaking.
 */

describe('stage model', () => {
  it('never puts a stage in both the active and closed lists', () => {
    // A stage in both would draw the same pitch in two kanban columns.
    const overlap = BUY_ACTIVE_STAGES.filter(s =>
      (BUY_CLOSED_STAGES as readonly string[]).includes(s));
    expect(overlap).toEqual([]);
  });

  it('has an expected-realization band for every stage', () => {
    // A missing band is `undefined` inside an arithmetic expression, so the
    // pipeline total silently becomes NaN rather than failing.
    const missing = BUY_ALL_STAGES.filter(s => typeof BUY_ER_BANDS[s] !== 'number');
    expect(missing).toEqual([]);
  });

  it('keeps every band a probability', () => {
    for (const [stage, band] of Object.entries(BUY_ER_BANDS)) {
      expect(band, `${stage} band`).toBeGreaterThanOrEqual(0);
      expect(band, `${stage} band`).toBeLessThanOrEqual(1);
    }
  });

  it('maps every closed stage to a loss reason, and only closed stages', () => {
    const mapped = Object.keys(CLOSED_STAGE_TO_LOSS_REASON).sort();
    expect(mapped).toEqual([...BUY_CLOSED_STAGES].sort());
  });

  it('gives Signed no loss reason, because winning is not a loss', () => {
    expect(CLOSED_STAGE_TO_LOSS_REASON.Signed).toBeNull();
    for (const stage of BUY_CLOSED_STAGES.filter(s => s !== 'Signed')) {
      expect(CLOSED_STAGE_TO_LOSS_REASON[stage], stage).toBeTruthy();
    }
  });
});

describe('negotiation log', () => {
  it('offers the neutral entry type on every side', () => {
    // Reopening a pitch and changing its route both log as Note regardless of
    // side, so a side without it cannot record either.
    for (const [side, types] of Object.entries(ENTRY_TYPES_BY_SIDE)) {
      expect(types, side).toContain(NEUTRAL_ENTRY_TYPE);
    }
  });

  it('gives every side at least one entry type', () => {
    for (const [side, types] of Object.entries(ENTRY_TYPES_BY_SIDE)) {
      expect(types.length, side).toBeGreaterThan(0);
    }
  });

  it('has no duplicate entry types within a side', () => {
    for (const [side, types] of Object.entries(ENTRY_TYPES_BY_SIDE)) {
      expect(new Set(types).size, `${side} has a repeated entry type`).toBe(types.length);
    }
  });
});

describe('negotiation types', () => {
  it('only triggers on types that exist', () => {
    const unknown = LOAN_TYPES_WITH_TRIGGER.filter(t => !NEGOTIATION_TYPES.includes(t));
    expect(unknown).toEqual([]);
  });

  it('only triggers on loans', () => {
    // A trigger value is the fee on a loan converting to a permanent deal, so
    // it is meaningless on a straight transfer or a free agent.
    for (const t of LOAN_TYPES_WITH_TRIGGER) {
      expect(t, `${t} should be a loan`).toMatch(/loan/i);
    }
  });
});

describe('track ladders', () => {
  const ladders = {
    selling: SELLING_TRACK,
    buying: BUYING_TRACK,
    player: PLAYER_TRACK,
  };

  it('has a label for every rung of every ladder', () => {
    // TRACK_LABELS is keyed `string`, so the compiler cannot check this. A gap
    // renders as `undefined` in the pitch panel.
    const missing: string[] = [];
    for (const [name, ladder] of Object.entries(ladders)) {
      for (const rung of ladder) {
        if (!TRACK_LABELS[rung]) missing.push(`${name}.${rung}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('starts every ladder at none, so a fresh pitch has a defined state', () => {
    for (const [name, ladder] of Object.entries(ladders)) {
      expect(ladder[0], `${name} ladder`).toBe('none');
    }
  });

  it('has no duplicate rungs within a ladder', () => {
    for (const [name, ladder] of Object.entries(ladders)) {
      expect(new Set(ladder).size, `${name} ladder has a repeated rung`).toBe(ladder.length);
    }
  });
});
