import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type FollowUpTargetType =
  | 'contact'
  | 'scouted_target'
  | 'buy_pitch';

export interface FollowUpTarget {
  type: FollowUpTargetType;
  id: string;
  label: string;
  sublabel?: string;
}

export interface FollowUpLink {
  id: string;
  follow_up_id: string;
  link_type: FollowUpTargetType;
  link_id: string;
  link_label: string;
  link_sublabel: string | null;
}

export interface FollowUp {
  id: string;
  // Polymorphic target
  target_type: FollowUpTargetType;
  target_id: string;
  target_label: string;
  target_sublabel: string | null;
  // Legacy contact fields (still populated for contact-targeted reminders)
  contact_id: string | null;
  contact_name: string | null;
  contact_club: string | null;
  due_date: string;
  action_text: string;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
}

export function useFollowUps() {
  return useQuery({
    queryKey: ['follow_ups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('follow_ups' as any)
        .select('*')
        .order('due_date', { ascending: true });
      if (error) throw error;
      return data as unknown as FollowUp[];
    },
  });
}

/** All non-completed reminders attached to a specific entity (target OR cross-link). */
export function useFollowUpsForTarget(target: { type: FollowUpTargetType; id: string } | null) {
  return useQuery({
    queryKey: ['follow_ups', 'target', target?.type, target?.id],
    queryFn: async () => {
      if (!target) return [];
      // Primary target hits
      const primary = await supabase
        .from('follow_ups' as any)
        .select('*')
        .eq('target_type', target.type)
        .eq('target_id', target.id)
        .eq('completed', false);
      if (primary.error) throw primary.error;

      // Cross-link hits
      const links = await supabase
        .from('follow_up_links' as any)
        .select('follow_up_id')
        .eq('link_type', target.type)
        .eq('link_id', target.id);
      if (links.error) throw links.error;

      const linkedIds = (links.data as any[] || []).map((l) => l.follow_up_id);
      let linked: any[] = [];
      if (linkedIds.length > 0) {
        const res = await supabase
          .from('follow_ups' as any)
          .select('*')
          .in('id', linkedIds)
          .eq('completed', false);
        if (res.error) throw res.error;
        linked = res.data || [];
      }

      // Dedupe by id
      const seen = new Set<string>();
      const all = [...(primary.data || []), ...linked].filter((f: any) => {
        if (seen.has(f.id)) return false;
        seen.add(f.id);
        return true;
      });
      return all as unknown as FollowUp[];
    },
    enabled: !!target,
  });
}

/** Backwards-compatible: contact-only reminders. */
export function useContactFollowUps(contactId: string | null) {
  return useFollowUpsForTarget(contactId ? { type: 'contact', id: contactId } : null);
}

export function useFollowUpLinks(followUpId: string | null) {
  return useQuery({
    queryKey: ['follow_up_links', followUpId],
    queryFn: async () => {
      if (!followUpId) return [];
      const { data, error } = await supabase
        .from('follow_up_links' as any)
        .select('*')
        .eq('follow_up_id', followUpId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as unknown as FollowUpLink[];
    },
    enabled: !!followUpId,
  });
}

export function useCreateFollowUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      target: FollowUpTarget;
      due_date: string;
      action_text: string;
      links?: Array<Omit<FollowUpTarget, never>>;
    }) => {
      const { target, due_date, action_text, links = [] } = input;
      const row: any = {
        target_type: target.type,
        target_id: target.id,
        target_label: target.label,
        target_sublabel: target.sublabel ?? null,
        due_date,
        action_text,
      };
      // Keep legacy contact fields populated for contact reminders so older queries keep working.
      if (target.type === 'contact') {
        row.contact_id = target.id;
        row.contact_name = target.label;
        row.contact_club = target.sublabel ?? '';
      }
      const { data, error } = await supabase
        .from('follow_ups' as any)
        .insert([row])
        .select()
        .single();
      if (error) throw error;

      const followUpId = (data as any).id;
      if (links.length > 0) {
        const linkRows = links.map((l) => ({
          follow_up_id: followUpId,
          link_type: l.type,
          link_id: l.id,
          link_label: l.label,
          link_sublabel: l.sublabel ?? null,
        }));
        const linkRes = await supabase.from('follow_up_links' as any).insert(linkRows);
        if (linkRes.error) throw linkRes.error;
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['follow_ups'] });
    },
  });
}

export function useAddFollowUpLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { follow_up_id: string; link: FollowUpTarget }) => {
      const { error } = await supabase.from('follow_up_links' as any).insert([{
        follow_up_id: input.follow_up_id,
        link_type: input.link.type,
        link_id: input.link.id,
        link_label: input.link.label,
        link_sublabel: input.link.sublabel ?? null,
      }]);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['follow_up_links', vars.follow_up_id] });
      qc.invalidateQueries({ queryKey: ['follow_ups'] });
    },
  });
}

export function useDeleteFollowUpLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('follow_up_links' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['follow_up_links'] });
      qc.invalidateQueries({ queryKey: ['follow_ups'] });
    },
  });
}

export function useCompleteFollowUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('follow_ups' as any)
        .update({ completed: true, completed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['follow_ups'] });
      const prev = qc.getQueryData<FollowUp[]>(['follow_ups']);
      qc.setQueryData<FollowUp[]>(['follow_ups'], (old) =>
        old?.map(f => f.id === id ? { ...f, completed: true, completed_at: new Date().toISOString() } : f)
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(['follow_ups'], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['follow_ups'] }),
  });
}

export function useDeleteFollowUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('follow_ups' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['follow_ups'] });
      const prev = qc.getQueryData<FollowUp[]>(['follow_ups']);
      qc.setQueryData<FollowUp[]>(['follow_ups'], (old) => old?.filter(f => f.id !== id));
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(['follow_ups'], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['follow_ups'] }),
  });
}

export function useFollowUpBadgeCount() {
  const { data: followUps = [] } = useFollowUps();
  const today = new Date().toISOString().split('T')[0];
  return followUps.filter(f => !f.completed && f.target_type !== 'buy_pitch' && f.due_date <= today).length;
}

/** Badge count for buy-side pitch reminders only (used on the Buy Pipeline page). */
export function useBuyPitchFollowUpBadgeCount() {
  const { data: followUps = [] } = useFollowUps();
  const today = new Date().toISOString().split('T')[0];
  return followUps.filter(f => !f.completed && f.target_type === 'buy_pitch' && f.due_date <= today).length;
}
