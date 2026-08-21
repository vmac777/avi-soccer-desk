import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { fetchAllRows } from '@/lib/fetchAllRows';

/**
 * The players an agent decided to put forward, in the order they chose.
 *
 * Distinct from the match ranking on purpose. The ranking says who fits; the
 * shortlist says who we sent, when, and why — including a line per player that
 * no score produces.
 */

export const SHORTLIST_STATUSES = [
  'shortlisted', 'presented', 'interested', 'passed', 'pitched',
] as const;
export type ShortlistStatus = typeof SHORTLIST_STATUSES[number];

export const SHORTLIST_STATUS_LABELS: Record<ShortlistStatus, string> = {
  shortlisted: 'On the list',
  presented: 'Sent',
  interested: 'Interested',
  passed: 'Passed',
  pitched: 'Pitched',
};

export interface ShortlistEntry {
  id: string;
  requirement_id: string;
  scouted_target_id: string;
  rank: number;
  note: string | null;
  /** The score when he was added. Not recomputed — see the migration. */
  match_score: number | null;
  status: ShortlistStatus;
  presented_at: string | null;
  buy_pitch_id: string | null;
  created_at: string;
}

// A single literal — see the note in useClubRequirements.
const SELECT = 'id, requirement_id, scouted_target_id, rank, note, match_score, status, presented_at, buy_pitch_id, created_at';

function narrowStatus(value: string): ShortlistStatus {
  return (SHORTLIST_STATUSES as readonly string[]).includes(value)
    ? (value as ShortlistStatus)
    : 'shortlisted';
}

/**
 * Every entry, filtered client-side.
 *
 * One query rather than one per requirement: the roster page needs "where else
 * have we put this player forward", the needs list needs a count per
 * requirement, and the detail page needs one list. Three query keys over the
 * same small table would be three chances to leave one stale after a write.
 */
export function useShortlistEntries() {
  return useQuery({
    queryKey: ['shortlist_entries'],
    queryFn: async () => {
      const rows = await fetchAllRows((from, to) =>
        supabase
          .from('shortlist_entries')
          .select(SELECT)
          .order('rank', { ascending: true })
          .range(from, to),
      );
      return (rows as (Omit<ShortlistEntry, 'status'> & { status: string })[])
        .map((r) => ({ ...r, status: narrowStatus(r.status) }));
    },
  });
}

export function useShortlist(requirementId: string | null) {
  const { data = [], isLoading } = useShortlistEntries();
  return {
    entries: requirementId
      ? data.filter((e) => e.requirement_id === requirementId).sort((a, b) => a.rank - b.rank)
      : [],
    isLoading,
  };
}

export function useAddToShortlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      requirement_id: string;
      scouted_target_id: string;
      /** The score at this moment, stored rather than recomputed on read. */
      match_score: number | null;
      rank: number;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase
        .from('shortlist_entries')
        .insert([{ ...input, created_by: session?.user?.id ?? null }])
        .select(SELECT)
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shortlist_entries'] }),
    onError: (err: Error & { code?: string }) => {
      // The unique constraint is the intended behaviour, not a fault: he is
      // already on this list. Say that rather than showing a Postgres error.
      if (err.code === '23505' || /duplicate key/i.test(err.message ?? '')) {
        toast.info('Already on this shortlist');
        return;
      }
      toast.error(err.message ?? "Couldn't add to the shortlist");
    },
  });
}

export function useUpdateShortlistEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: {
      id: string;
      rank?: number;
      note?: string | null;
      status?: ShortlistStatus;
      presented_at?: string | null;
      buy_pitch_id?: string | null;
    }) => {
      const { error } = await supabase.from('shortlist_entries').update(patch).eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, ...patch }) => {
      // Reordering and note-typing want to feel instant. Rollback is loud —
      // a silent one is indistinguishable from a control that does nothing.
      await qc.cancelQueries({ queryKey: ['shortlist_entries'] });
      const prev = qc.getQueryData<ShortlistEntry[]>(['shortlist_entries']);
      qc.setQueryData<ShortlistEntry[]>(['shortlist_entries'], (old) =>
        old?.map((e) => (e.id === id ? { ...e, ...patch } : e)));
      return { prev };
    },
    onError: (err: Error, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['shortlist_entries'], ctx.prev);
      toast.error(err.message ?? "Couldn't update that entry");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['shortlist_entries'] }),
  });
}

export function useRemoveFromShortlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('shortlist_entries').delete().eq('id', id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['shortlist_entries'] });
      const prev = qc.getQueryData<ShortlistEntry[]>(['shortlist_entries']);
      qc.setQueryData<ShortlistEntry[]>(['shortlist_entries'], (old) =>
        old?.filter((e) => e.id !== id));
      return { prev };
    },
    onError: (err: Error, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(['shortlist_entries'], ctx.prev);
      toast.error(err.message ?? "Couldn't remove that entry");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['shortlist_entries'] }),
  });
}

/** Stamps a whole list as sent, which is what makes it a dated record. */
export function useMarkShortlistPresented() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      const { error } = await supabase
        .from('shortlist_entries')
        .update({ status: 'presented', presented_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shortlist_entries'] }),
    onError: (err: Error) => toast.error(err.message ?? "Couldn't mark the list as sent"),
  });
}
