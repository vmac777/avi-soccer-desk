import { lazy, type ComponentType } from 'react';

/**
 * A lazily-loaded route that survives a deploy.
 *
 * Splitting the routes into their own chunks made the entry bundle a third of
 * the size, and introduced a failure nobody sees until a deploy lands under a
 * tab somebody left open. The browser is holding an `index.html` from before
 * the deploy, so it asks for `Roster-DMRjz7el.js`; the new build renamed that
 * file and the old one is gone. The import rejects and the route dies with
 * "Failed to fetch dynamically imported module" — which reads, to whoever is
 * looking at it, as the whole platform being down.
 *
 * It is not down. The page they have is simply out of date, and the fix is to
 * fetch the current one. Doing that automatically is the difference between a
 * demo that stumbles and one that nobody notices.
 *
 * Guarded against looping: the reload happens at most once per session, so a
 * genuinely broken deploy surfaces the error instead of refreshing forever.
 * The flag clears on the next successful load, so the *next* deploy can do the
 * same thing again.
 */

const RELOADED_KEY = 'avi:chunk-reloaded';

/** sessionStorage throws in some privacy modes; a missing flag is survivable. */
function readFlag(): boolean {
  try {
    return sessionStorage.getItem(RELOADED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeFlag(value: boolean): void {
  try {
    if (value) sessionStorage.setItem(RELOADED_KEY, '1');
    else sessionStorage.removeItem(RELOADED_KEY);
  } catch {
    /* ignore — worst case we simply do not auto-reload */
  }
}

/**
 * The retry itself, separated from `lazy` so it can be tested.
 *
 * The loop guard is the part worth pinning: get it wrong and a broken deploy
 * refreshes the tab forever instead of showing an error.
 */
export function withDeployRetry<T>(
  load: () => Promise<{ default: T }>,
): () => Promise<{ default: T }> {
  return async () => {
    try {
      const mod = await load();
      // Got there. Let a future deploy trigger its own reload.
      writeFlag(false);
      return mod;
    } catch (err) {
      if (readFlag()) throw err;
      writeFlag(true);
      window.location.reload();
      // The reload takes over, so this promise deliberately never settles —
      // resolving with a placeholder would flash a wrong page on the way out.
      return new Promise<{ default: T }>(() => {});
    }
  };
}

export function lazyRoute<T extends ComponentType<unknown>>(
  load: () => Promise<{ default: T }>,
) {
  return lazy(withDeployRetry(load));
}
