import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { SELLING_TRACK, BUYING_TRACK, PLAYER_TRACK } from './placementStage';
import { ENTRY_TYPES_BY_SIDE } from '@/hooks/useBuyData';
import type { BallInCourt } from '@/hooks/useBuyData';
import type { FollowUpTargetType } from '@/hooks/useFollowUps';
import type { ErrorKind } from './reportError';

/**
 * The vocabularies in the code have to be values the database will accept.
 *
 * This is the bug that cost the most on this project. The buy desk was
 * repurposed into a placement desk and its columns were renamed — and in
 * Postgres a renamed column keeps its CHECK constraint. So the database still
 * only accepted the old buying-desk words while the app had switched to new
 * ones. Every write was rejected, the optimistic update painted the new value
 * anyway, and the rollback was silent: the buttons looked dead. It survived two
 * commits that both looked green, because nothing here could see the schema.
 *
 * These tests read the migrations and assert every value the code can write is
 * one the CHECK allows. They are not a substitute for running against the real
 * database — a constraint applied by hand and never committed would still slip
 * through — but they close the gap that actually opened.
 *
 * Direction matters: code ⊆ database. Extra values in the constraint are
 * harmless (a ladder rung nothing sets yet); a value in the code that the
 * constraint rejects is a dead button.
 */

const MIGRATIONS = join(process.cwd(), 'supabase/migrations');

/**
 * The values a column's CHECK allows, per the last migration that defines one.
 *
 * "Last" is the whole point: constraints get dropped and re-added, and reading
 * an earlier definition would assert against a schema that no longer exists.
 */
function allowedValues(column: string): string[] {
  let found: string[] | null = null;

  for (const file of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    const pattern = new RegExp(
      `CHECK\\s*\\(\\s*(?:${column}\\s+IS\\s+NULL\\s+OR\\s+)?${column}\\s+IN\\s*\\(([^)]*)\\)`,
      'gi',
    );
    for (const match of sql.matchAll(pattern)) {
      found = [...match[1].matchAll(/'([^']*)'/g)].map(m => m[1]);
    }
  }

  if (!found) throw new Error(`No CHECK ... IN constraint found for column "${column}"`);
  return found;
}

/** Fails with the offending values named, not just a boolean. */
function expectSubset(code: readonly string[], column: string) {
  const allowed = allowedValues(column);
  const rejected = code.filter(v => !allowed.includes(v));
  expect(
    rejected,
    `${column}: the database would reject ${JSON.stringify(rejected)}. `
    + `It allows ${JSON.stringify(allowed)}.`,
  ).toEqual([]);
}

describe('code vocabularies are accepted by the database', () => {
  it('selling_track', () => expectSubset(SELLING_TRACK, 'selling_track'));
  it('buying_track', () => expectSubset(BUYING_TRACK, 'buying_track'));
  it('player_track', () => expectSubset(PLAYER_TRACK, 'player_track'));

  it('ball_in_court', () => {
    // The union type is erased at runtime, so it is restated here. Adding a
    // member to BallInCourt without adding it below makes this test stale
    // rather than wrong — the type-level check underneath catches that.
    const values: BallInCourt[] = ['us', 'selling', 'buying', 'player'];
    const _exhaustive: Record<BallInCourt, true> = {
      us: true, selling: true, buying: true, player: true,
    };
    expect(Object.keys(_exhaustive).sort()).toEqual([...values].sort());
    expectSubset(values, 'ball_in_court');
  });

  it('buy_negotiation_entries.side', () => {
    expectSubset(Object.keys(ENTRY_TYPES_BY_SIDE), 'side');
  });

  it('follow_ups.target_type', () => {
    const values: FollowUpTargetType[] = ['contact', 'scouted_target', 'buy_pitch'];
    const _exhaustive: Record<FollowUpTargetType, true> = {
      contact: true, scouted_target: true, buy_pitch: true,
    };
    expect(Object.keys(_exhaustive).sort()).toEqual([...values].sort());
    expectSubset(values, 'target_type');
  });

  it('client_errors.kind', () => {
    const values: ErrorKind[] = ['render', 'unhandled_rejection', 'window_error'];
    const _exhaustive: Record<ErrorKind, true> = {
      render: true, unhandled_rejection: true, window_error: true,
    };
    expect(Object.keys(_exhaustive).sort()).toEqual([...values].sort());
    expectSubset(values, 'kind');
  });
});

describe('the checker itself', () => {
  it('reads the latest definition, not the first', () => {
    // `ball_in_court` was constrained once for the buying desk and again for
    // the three-sided model. Reading the first would assert against a schema
    // that has not existed since.
    expect(allowedValues('ball_in_court')).toContain('player');
  });

  it('fails loudly for a column with no constraint', () => {
    expect(() => allowedValues('no_such_column_anywhere')).toThrow(/No CHECK/);
  });
});
