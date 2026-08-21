import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { fetchAllRows } from '@/lib/fetchAllRows';
import type { ClubRequirement } from '@/lib/matching';

/**
 * What clubs are looking for.
 *
 * The table has existed since the agent-desk schema landed and nothing has
 * ever read or written it — this is the missing half. `contacts.needs` stays
 * as free text alongside; it holds nuance no column captures. This is the
 * structured part, which exists so a roster can be matched against it.
 */

export type RequirementStatus = 'open' | 'filled' | 'withdrawn';

export const REQUIREMENT_STATUSES: RequirementStatus[] = ['open', 'filled', 'withdrawn'];

/** A requirement plus the club it belongs to, which is what every view wants. */
export interface RequirementRow extends ClubRequirement {
  created_at: string;
}

/**
 * The database types `status` as plain text under a CHECK constraint, so it
 * arrives as `string`. Narrowing it here — at the one boundary where rows
 * enter the app — keeps every consumer honest without casting at each use.
 *
 * An unrecognised value is treated as withdrawn rather than crashing or
 * silently becoming 'open': a row the app does not understand should not turn
 * up in a shortlist being sent to a club.
 */
function narrowStatus(value: string): RequirementStatus {
  return (REQUIREMENT_STATUSES as string[]).includes(value)
    ? (value as RequirementStatus)
    : 'withdrawn';
}

type RequirementDbRow = {
  id: string;
  club_id: string | null;
  contact_id: string | null;
  position: string;
  age_min: number | null;
  age_max: number | null;
  budget_min: number | null;
  budget_max: number | null;
  salary_max: number | null;
  foot: string | null;
  needs_eu_passport: boolean;
  league_experience: string[];
  window_target: string | null;
  status: string;
  notes: string | null;
  created_at: string;
};

export function toRequirement(row: RequirementDbRow): RequirementRow {
  return {
    id: row.id,
    club_id: row.club_id,
    contact_id: row.contact_id,
    position: row.position,
    age_min: row.age_min,
    age_max: row.age_max,
    budget_min: row.budget_min,
    budget_max: row.budget_max,
    salary_max: row.salary_max,
    foot: row.foot,
    needs_eu_passport: row.needs_eu_passport,
    // NOT NULL DEFAULT '{}' in the schema, but a null here would crash the
    // league scorer, and a crash on a club-facing screen is not worth the
    // purity of trusting the column.
    league_experience: row.league_experience ?? [],
    window_target: row.window_target,
    status: narrowStatus(row.status),
    notes: row.notes,
    created_at: row.created_at,
  };
}

// One literal, not a concatenation: supabase-js parses the select string at the
// type level, and a joined string collapses the row type to an error object.
const SELECT = 'id, club_id, contact_id, position, age_min, age_max, budget_min, budget_max, salary_max, foot, needs_eu_passport, league_experience, window_target, status, notes, created_at';

/** Every requirement, for the needs page and for matching a player back. */
export function useAllRequirements() {
  return useQuery({
    queryKey: ['club_requirements'],
    queryFn: async () => {
      const rows = await fetchAllRows((from, to) =>
        supabase
          .from('club_requirements')
          .select(SELECT)
          .order('created_at', { ascending: false })
          .range(from, to),
      );
      return (rows as RequirementDbRow[]).map(toRequirement);
    },
  });
}

/** One requirement by id, read out of the full list so both stay in step. */
export function useRequirement(id: string | null) {
  const { data = [], isLoading } = useAllRequirements();
  return {
    requirement: id ? data.find((r) => r.id === id) ?? null : null,
    isLoading,
  };
}

export interface RequirementInput {
  club_id: string | null;
  contact_id: string | null;
  position: string;
  age_min: number | null;
  age_max: number | null;
  budget_min: number | null;
  budget_max: number | null;
  salary_max: number | null;
  foot: string | null;
  needs_eu_passport: boolean;
  league_experience: string[];
  window_target: string | null;
  notes: string | null;
}

export function useCreateRequirement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RequirementInput) => {
      if (!input.club_id && !input.contact_id) {
        throw new Error('A requirement needs a club or the person who reported it.');
      }
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase
        .from('club_requirements')
        .insert([{ ...input, created_by: session?.user?.id ?? null }])
        .select(SELECT)
        .single();
      if (error) throw error;
      return toRequirement(data as RequirementDbRow);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['club_requirements'] }),
    onError: (err: Error) => toast.error(err.message ?? "Couldn't save that requirement"),
  });
}

export function useUpdateRequirement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<RequirementInput> & {
      id: string;
      status?: RequirementStatus;
    }) => {
      const { error } = await supabase
        .from('club_requirements')
        .update(patch)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['club_requirements'] }),
    onError: (err: Error) => toast.error(err.message ?? "Couldn't update that requirement"),
  });
}

export function useDeleteRequirement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // shortlist_entries cascades on the foreign key, so the list goes with it.
      const { error } = await supabase.from('club_requirements').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['club_requirements'] });
      qc.invalidateQueries({ queryKey: ['shortlist_entries'] });
    },
    onError: (err: Error) => toast.error(err.message ?? "Couldn't delete that requirement"),
  });
}
