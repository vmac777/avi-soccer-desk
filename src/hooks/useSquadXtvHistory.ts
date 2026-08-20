import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface XtvHistoryEntry {
  year: number;
  month: number;
  xtv: number;
}

/**
 * Returns fresh xTV history for a squad player from squad_player_xtv_history,
 * populated weekly by the refresh-squad-xtv-history edge function.
 * Returns null while loading or when no TR id / no rows exist.
 */
export function useSquadXtvHistory(trId: number | null | undefined) {
  const [history, setHistory] = useState<XtvHistoryEntry[] | null>(null);

  useEffect(() => {
    if (!trId) { setHistory(null); return; }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('squad_player_xtv_history')
        .select('year, month, xtv')
        .eq('tr_player_id', trId)
        .order('year', { ascending: true })
        .order('month', { ascending: true });
      if (cancelled) return;
      if (error || !data || data.length === 0) { setHistory(null); return; }
      setHistory(data.map(r => ({ year: r.year, month: r.month, xtv: Number(r.xtv) })));
    })();
    return () => { cancelled = true; };
  }, [trId]);

  return history;
}
