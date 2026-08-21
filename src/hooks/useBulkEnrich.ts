import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { enrichTarget } from './useEnrichScoutedTarget';
import type { ScoutedTarget } from './useBuyData';

/**
 * Enrich a whole roster, one player at a time.
 *
 * A roster arrives as names and Transfermarkt links. Everything a club document
 * is actually made of — date of birth, height, foot, photo, exact contract
 * dates, valuation — still has to be fetched, and doing that by hand across
 * ninety-five players is not a workflow anyone will follow.
 *
 * Deliberately sequential. Each player is two calls out to third-party sites,
 * and firing ninety-five of those at once is how you get rate-limited partway
 * through and lose the rest of the run. Slow and complete beats fast and
 * half-done. Progress is reported per player so the wait is legible rather than
 * a frozen button, and the run can be stopped without losing what it has
 * already written — each player is committed as it completes.
 */

const PAUSE_MS = 400;

export interface BulkEnrichProgress {
  running: boolean;
  done: number;
  total: number;
  failed: number;
  current?: string;
}

const IDLE: BulkEnrichProgress = { running: false, done: 0, total: 0, failed: 0 };

/** Never read at all: there is a link to follow and we have not followed it. */
export function needsEnrichment(t: ScoutedTarget): boolean {
  return !!t.tm_link && t.tm_status !== 'ok';
}

/**
 * Read from Transfermarkt but not from TransferRoom.
 *
 * This is most of a roster after the first pass, and it used to be invisible:
 * the sweep only looked at tm_status, so once Transfermarkt had succeeded for
 * everyone the button had nothing to do — even with TransferRoom failing on
 * ninety players. Resolving their clubs afterwards did not change that, which is
 * exactly when you most need to run it again.
 */
export function needsTrRetry(t: ScoutedTarget): boolean {
  return !!t.tm_link && t.tm_status === 'ok' && t.tr_status !== 'ok';
}

/** Anything the sweep would touch by default. */
export function isPending(t: ScoutedTarget): boolean {
  return needsEnrichment(t) || needsTrRetry(t);
}

export function useBulkEnrich() {
  const qc = useQueryClient();
  const [progress, setProgress] = useState<BulkEnrichProgress>(IDLE);
  const cancelled = useRef(false);

  const run = useCallback(
    async (targets: ScoutedTarget[], { all = false }: { all?: boolean } = {}) => {
      const queue = all
        ? targets.filter((t) => t.tm_link)
        : targets.filter(isPending);
      if (queue.length === 0) return { ...IDLE };

      cancelled.current = false;
      let failed = 0;
      let done = 0;

      for (const target of queue) {
        if (cancelled.current) break;
        setProgress({ running: true, done, total: queue.length, failed, current: target.name });

        try {
          // Don't re-read Transfermarkt for a player it already answered on —
          // that is the slow half and the half that rate-limits. Unless this is
          // an explicit refresh, in which case the point is to re-read both.
          const sources: ('tm' | 'tr')[] =
            !all && target.tm_status === 'ok' ? ['tr'] : ['tm', 'tr'];
          const r = await enrichTarget(target, sources);
          // TransferRoom not matching a player is ordinary — plenty of them are
          // not in it. Failing to read Transfermarkt is the one worth counting,
          // since that is where the link pointed.
          if (r.tm === 'failed' || (r.tm === 'skipped' && r.tr === 'failed')) failed++;
        } catch {
          failed++;
        }

        done++;
        setProgress({ running: true, done, total: queue.length, failed, current: target.name });
        // Refresh as we go, so the roster fills in while the run continues.
        qc.invalidateQueries({ queryKey: ['scouted_targets'] });
        await new Promise((r) => setTimeout(r, PAUSE_MS));
      }

      const result = { running: false, done, total: queue.length, failed };
      setProgress(result);
      qc.invalidateQueries({ queryKey: ['scouted_targets'] });
      return result;
    },
    [qc],
  );

  const cancel = useCallback(() => {
    cancelled.current = true;
  }, []);

  return { progress, run, cancel, reset: () => setProgress(IDLE) };
}
