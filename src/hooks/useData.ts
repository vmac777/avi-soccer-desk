import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ContactEnriched, Interaction, Player, PlayerClubLink } from '@/lib/supabase';
import type { TablesInsert } from '@/integrations/supabase/types';

// Contacts
export function useContacts() {
  return useQuery({
    queryKey: ['contacts_enriched'],
    queryFn: async () => {
      const allData: ContactEnriched[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('contacts_enriched')
          .select('*')
          .order('market', { ascending: true })
          .order('club', { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        allData.push(...(data as ContactEnriched[]));
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return allData;
    },
  });
}

export function useContact(id: string | null) {
  return useQuery({
    queryKey: ['contacts_enriched', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('contacts_enriched')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as ContactEnriched;
    },
    enabled: !!id,
  });
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (contact: TablesInsert<'contacts'>) => {
      const { data, error } = await supabase.from('contacts').insert([contact]).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts_enriched'] }),
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<ContactEnriched>) => {
      const { is_primary, ...safeUpdates } = updates as any;
      const { data, error } = await supabase.from('contacts').update(safeUpdates).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts_enriched'] }),
  });
}

export function useSetPrimaryContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ contactId, club, value }: { contactId: string; club: string; value: boolean }) => {
      if (value) {
        // Check how many primaries this club already has
        const { data: existing } = await supabase
          .from('contacts')
          .select('id')
          .eq('club', club)
          .eq('is_primary', true as any);
        // If already 2 primaries, unset the oldest one (first in list) to make room
        if (existing && existing.length >= 2) {
          await supabase.from('contacts').update({ is_primary: false } as any).eq('id', existing[0].id);
        }
        await supabase.from('contacts').update({ is_primary: true } as any).eq('id', contactId);
      } else {
        await supabase.from('contacts').update({ is_primary: false } as any).eq('id', contactId);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts_enriched'] }),
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('contacts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts_enriched'] }),
  });
}

// Log Touch - one-tap
export function useLogTouch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ contactId, loggedBy, club }: { contactId: string; loggedBy: string; club: string }) => {
      const today = new Date().toISOString().split('T')[0];
      // Update last_contact
      await supabase.from('contacts').update({ last_contact: today }).eq('id', contactId);
      // Create interaction
      await supabase.from('interactions').insert({
        contact_id: contactId,
        note: `Logged touch with ${club}`,
        interaction_type: 'Call',
        logged_by: loggedBy,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts_enriched'] });
      qc.invalidateQueries({ queryKey: ['interactions'] });
    },
  });
}

// Interactions
export function useInteractions(contactId: string | null) {
  return useQuery({
    queryKey: ['interactions', contactId],
    queryFn: async () => {
      if (!contactId) return [];
      const { data, error } = await supabase
        .from('interactions')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Interaction[];
    },
    enabled: !!contactId,
  });
}

export function useRecentInteractions(limit = 20) {
  return useQuery({
    queryKey: ['interactions', 'recent', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('interactions')
        .select('*, contacts(club, market)')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateInteraction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (interaction: TablesInsert<'interactions'>) => {
      const { data, error } = await supabase.from('interactions').insert([interaction]).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['interactions'] });
      qc.invalidateQueries({ queryKey: ['contacts_enriched'] });
    },
  });
}

export function useDeleteInteraction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('interactions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['interactions'] });
      qc.invalidateQueries({ queryKey: ['contacts_enriched'] });
    },
  });
}

// Players
export function usePlayers() {
  return useQuery({
    queryKey: ['players'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('players_tracking')
        .select('*')
        .order('player_name');
      if (error) throw error;
      return data as Player[];
    },
  });
}

export function useCreatePlayer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (player: TablesInsert<'players_tracking'>) => {
      const { data, error } = await supabase.from('players_tracking').insert([player]).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['players'] }),
  });
}

export function useUpdatePlayer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<Player>) => {
      const { data, error } = await supabase.from('players_tracking').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['players'] }),
  });
}

export function useDeletePlayer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('players_tracking').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['players'] }),
  });
}

// Player-Club Links
export function usePlayerClubLinks(playerId?: string | null, contactId?: string | null) {
  return useQuery({
    queryKey: ['player_club_links', playerId, contactId],
    queryFn: async () => {
      let query = supabase.from('player_club_links').select('*, players_tracking(player_name, position), contacts(club, market)');
      if (playerId) query = query.eq('player_id', playerId);
      if (contactId) query = query.eq('contact_id', contactId);
      const { data, error } = await query.order('date_linked', { ascending: false });
      if (error) throw error;
      return data as (PlayerClubLink & { players_tracking?: { player_name: string; position: string }; contacts?: { club: string; market: string } })[];
    },
    enabled: !!(playerId || contactId),
  });
}

export function useCreatePlayerClubLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (link: TablesInsert<'player_club_links'>) => {
      const { data, error } = await supabase.from('player_club_links').insert([link]).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['player_club_links'] }),
  });
}

export function useDeletePlayerClubLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('player_club_links').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['player_club_links'] }),
  });
}

// Pitch Notes
export function usePitchNotes(pitchId: string | null) {
  return useQuery({
    queryKey: ['pitch_notes', pitchId],
    queryFn: async () => {
      if (!pitchId) return [];
      const { data, error } = await supabase
        .from('pitch_notes')
        .select('*')
        .eq('pitch_id', pitchId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!pitchId,
  });
}

export function useCreatePitchNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (note: { pitch_id: string; note: string; logged_by: string }) => {
      const { data, error } = await supabase.from('pitch_notes').insert([note]).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['pitch_notes', vars.pitch_id] }),
  });
}

export function useDeletePitchNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, pitchId }: { id: string; pitchId: string }) => {
      const { error } = await supabase.from('pitch_notes').delete().eq('id', id);
      if (error) throw error;
      return pitchId;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['pitch_notes', vars.pitchId] }),
  });
}

// Pitch Documents
export function usePitchDocuments(pitchId: string | null) {
  return useQuery({
    queryKey: ['pitch_documents', pitchId],
    queryFn: async () => {
      if (!pitchId) return [];
      const { data, error } = await supabase
        .from('pitch_documents')
        .select('*')
        .eq('pitch_id', pitchId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!pitchId,
  });
}

export function useCreatePitchDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (doc: { pitch_id: string; file_name: string; file_path: string; file_size: number; content_type: string; uploaded_by: string }) => {
      const { data, error } = await supabase.from('pitch_documents').insert([doc]).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['pitch_documents', vars.pitch_id] }),
  });
}

export function useDeletePitchDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, pitchId, filePath }: { id: string; pitchId: string; filePath: string }) => {
      // Delete from storage first
      await supabase.storage.from('pitch-documents').remove([filePath]);
      // Then delete the record
      const { error } = await supabase.from('pitch_documents').delete().eq('id', id);
      if (error) throw error;
      return pitchId;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['pitch_documents', vars.pitchId] }),
  });
}
