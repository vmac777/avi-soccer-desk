import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface TrTeamHistoryEntry {
  FromTeamId?: string;
  FromTeam?: string;
  ToTeamId?: string;
  ToTeam?: string;
  Date?: string;
  EndDate?: string;
  TransferType?: string;
  TransferFeeEuros?: string;
}

/**
 * Fetches TeamHistory (with TransferFeeEuros) from tr_player_details_cache
 * for a single TR player id. Returns parsed array or null.
 */
export function useTrTeamHistory(trId: number | undefined) {
  const [history, setHistory] = useState<TrTeamHistoryEntry[] | null>(null);

  useEffect(() => {
    if (!trId) {
      setHistory(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('tr_player_details_cache')
        .select('player_json')
        .eq('tr_player_id', trId)
        .maybeSingle();
      if (cancelled) return;
      const raw = (data?.player_json as any)?.TeamHistory;
      if (!raw) {
        setHistory(null);
        return;
      }
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        setHistory(Array.isArray(parsed) ? parsed : null);
      } catch {
        setHistory(null);
      }
    })();
    return () => { cancelled = true; };
  }, [trId]);

  return history;
}

/**
 * Returns a fee in € (number) for a transferHistory row matched by date.
 * Match is by exact YYYY-MM-DD on the `Date` field.
 */
export function findTrFee(
  history: TrTeamHistoryEntry[] | null,
  date: string,
): number | null {
  if (!history || !date) return null;
  const target = date.slice(0, 10);
  const hit = history.find((h) => (h.Date ?? '').slice(0, 10) === target);
  if (!hit) return null;
  const f = Number(hit.TransferFeeEuros);
  return Number.isFinite(f) ? f : null;
}
