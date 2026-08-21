// São Paulo is UTC-3, so the local day and the UTC day disagree for the last
// three hours of every evening. That gap is the whole point of these helpers,
// and in UTC the tests below would pass against the broken code too.
process.env.TZ = 'America/Sao_Paulo';

import { describe, it, expect, afterEach, vi } from 'vitest';
import { todayKey, parseDateKey, toDateKey } from './dateKeys';

afterEach(() => vi.useRealTimers());

describe('todayKey', () => {
  it('is the local day, not the UTC day, late in the evening', () => {
    // 01:00 UTC on the 22nd is 22:00 on the 21st in São Paulo.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-22T01:00:00Z'));

    expect(todayKey()).toBe('2026-08-21');
    // What the app used to do, kept here to show the two genuinely differ:
    expect(new Date().toISOString().split('T')[0]).toBe('2026-08-22');
  });

  it('agrees with the UTC day during working hours', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-21T14:00:00Z'));
    expect(todayKey()).toBe('2026-08-21');
  });
});

describe('parseDateKey', () => {
  it('reads a stored date as local midnight, not UTC midnight', () => {
    const d = parseDateKey('2026-08-21');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7); // August
    expect(d.getDate()).toBe(21);
    expect(d.getHours()).toBe(0);
  });

  it('round-trips through toDateKey', () => {
    expect(toDateKey(parseDateKey('2026-01-01'))).toBe('2026-01-01');
    expect(toDateKey(parseDateKey('2026-12-31'))).toBe('2026-12-31');
  });
});
