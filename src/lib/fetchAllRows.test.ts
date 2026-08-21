import { describe, it, expect } from 'vitest';
import { fetchAllRows } from './fetchAllRows';

/**
 * PostgREST truncates at 1000 rows and returns a 200, so the failure this
 * guards against is silent by construction. These pin the boundary, because
 * off-by-one paging is the classic way to lose exactly one row per page.
 */

/** A fake table of `total` rows that honours the requested range. */
const table = (total: number) => {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }));
  const calls: [number, number][] = [];
  const build = (from: number, to: number) => {
    calls.push([from, to]);
    return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
  };
  return { build, calls };
};

describe('fetchAllRows', () => {
  it('returns everything when there is less than one page', async () => {
    const { build, calls } = table(12);
    expect(await fetchAllRows(build)).toHaveLength(12);
    expect(calls).toEqual([[0, 999]]);
  });

  it('stops after one request on an exactly-full-but-final page', async () => {
    // 1000 rows: the first page is full, so it asks again and gets nothing.
    const { build, calls } = table(1000);
    expect(await fetchAllRows(build)).toHaveLength(1000);
    expect(calls).toEqual([[0, 999], [1000, 1999]]);
  });

  it('pages past the 1000-row cap — the whole point', async () => {
    const { build, calls } = table(2350);
    const rows = await fetchAllRows<{ id: number }>(build);
    expect(rows).toHaveLength(2350);
    // No row lost or repeated at a page seam.
    expect(rows.map(r => r.id)).toEqual(Array.from({ length: 2350 }, (_, i) => i));
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('returns empty for an empty table', async () => {
    const { build } = table(0);
    expect(await fetchAllRows(build)).toEqual([]);
  });

  it('throws the query error instead of returning a short list', async () => {
    await expect(
      fetchAllRows(() => Promise.resolve({ data: null, error: { message: 'permission denied' } })),
    ).rejects.toThrow('permission denied');
  });

  it('surfaces an error found partway through, rather than the rows so far', async () => {
    let call = 0;
    await expect(
      fetchAllRows(() => {
        call++;
        return Promise.resolve(
          call === 1
            ? { data: Array.from({ length: 1000 }, (_, i) => ({ id: i })), error: null }
            : { data: null, error: { message: 'connection reset' } },
        );
      }),
    ).rejects.toThrow('connection reset');
  });

  it('refuses to loop forever when the builder ignores its range', async () => {
    // Always returns a full page — the bug this guard exists for.
    const build = () =>
      Promise.resolve({ data: Array.from({ length: 1000 }, (_, i) => ({ id: i })), error: null });
    await expect(fetchAllRows(build)).rejects.toThrow(/ignoring its range arguments/);
  });
});
