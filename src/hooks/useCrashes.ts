import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Front-end crashes, grouped by message.
 *
 * One bug hit fifty times is one line on the page, not fifty. Grouping happens
 * here rather than in SQL because the set is small — acknowledged rows drop out
 * and the window is a week — and a view would be another piece of schema to
 * keep in step with the types.
 */

export interface CrashGroup {
  message: string;
  kind: string;
  route: string | null;
  stack: string | null;
  count: number;
  last_seen: string;
  /** Every row in the group, so acknowledging clears the whole thing. */
  ids: string[];
}

const WINDOW_DAYS = 7;

export function useCrashes() {
  return useQuery({
    queryKey: ['client_errors'],
    queryFn: async (): Promise<CrashGroup[]> => {
      const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('client_errors')
        .select('id, message, kind, route, stack, occurred_at')
        .is('acknowledged_at', null)
        .gte('occurred_at', since)
        .order('occurred_at', { ascending: false })
        .limit(500);
      if (error) throw error;

      const groups = new Map<string, CrashGroup>();
      for (const row of data ?? []) {
        const existing = groups.get(row.message);
        if (existing) {
          existing.count++;
          existing.ids.push(row.id);
          // Rows arrive newest first, so the first one seen is the latest.
          continue;
        }
        groups.set(row.message, {
          message: row.message,
          kind: row.kind,
          route: row.route,
          stack: row.stack,
          count: 1,
          last_seen: row.occurred_at,
          ids: [row.id],
        });
      }
      return [...groups.values()].sort((a, b) => b.last_seen.localeCompare(a.last_seen));
    },
    // Crashes are not urgent to the second, and this page already polls health
    // every 30s — no reason to add a second timer.
    staleTime: 60_000,
  });
}

export function useAcknowledgeCrash() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { data: { session } } = await supabase.auth.getSession();
      const { error } = await supabase
        .from('client_errors')
        .update({
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: session?.user?.id ?? null,
        })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client_errors'] }),
    onError: (err: Error) => toast.error(err.message ?? "Couldn't acknowledge that crash"),
  });
}
