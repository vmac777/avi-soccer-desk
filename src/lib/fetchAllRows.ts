/**
 * Read every row of a query, not the first thousand.
 *
 * PostgREST caps a response at 1000 rows by default. It does not error when it
 * truncates — you get 1000 rows and a 200, so the app looks fine and is simply
 * missing data. Two queries in this codebase already carried hand-written
 * paging loops, which is what being bitten by this looks like; `follow_ups` did
 * not, and it accumulates forever because completed reminders are never purged.
 * A reminder list that silently stops at a thousand is worse than one that
 * fails, because nobody goes looking.
 *
 * The `range` upper bound is inclusive, hence `from + PAGE_SIZE - 1`.
 */

/** PostgREST's default response cap. Ask for exactly this and no more. */
const PAGE_SIZE = 1000;

/**
 * Refuse to page forever.
 *
 * If a caller passes a builder that ignores `range`, every page comes back full
 * and identical and the loop never ends — the tab locks up with no error. This
 * turns that into a thrown message naming the likely cause.
 */
const MAX_ROWS = 200_000;

interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

export async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return all;

    all.push(...data);

    // A short page is the last page.
    if (data.length < PAGE_SIZE) return all;

    from += PAGE_SIZE;
    if (from >= MAX_ROWS) {
      throw new Error(
        `fetchAllRows stopped at ${MAX_ROWS} rows. Either this query genuinely ` +
        `returns that many — in which case it needs a filter, not paging — or ` +
        `the builder is ignoring its range arguments.`,
      );
    }
  }
}
