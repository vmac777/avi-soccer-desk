import { describe, it, expect } from 'vitest';
import { hasCounterparty } from './pitchPairing';

describe('hasCounterparty', () => {
  it('accepts either side alone', () => {
    expect(hasCounterparty('c1', null)).toBe(true);
    expect(hasCounterparty(null, 'b1')).toBe(true);
  });

  it('rejects a pitch with nobody on it', () => {
    expect(hasCounterparty(null, null)).toBe(false);
    expect(hasCounterparty(undefined, undefined)).toBe(false);
  });

  // The selects hand back '' for "not chosen", which is absence, not a club.
  it('reads an empty selection as absent', () => {
    expect(hasCounterparty('', '')).toBe(false);
    expect(hasCounterparty('', 'b1')).toBe(true);
  });
});
