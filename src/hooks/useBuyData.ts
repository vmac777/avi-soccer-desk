import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ─── Types ───────────────────────────────────────────────

export interface ScoutedTarget {
  id: string;
  name: string;
  slug: string;
  position: string;
  age: number | null;
  date_of_birth: string | null;
  nationality: string;
  current_club: string;
  league: string;
  contract_end: string | null;
  market_value: number | null;
  height: string;
  foot: string;
  photo_url: string;
  salary_estimate: number | null;
  agent_name: string;
  agent_contact: string;
  priority_ranking: string;
  notes: string;
  tm_link: string;
  has_valuation: boolean;
  valuation_url: string;
  created_at: string;
  updated_at: string;
  // Enrichment
  tm_player_id?: string | null;
  tr_player_id?: number | null;
  xtv?: number | null;
  xtv_as_of?: string | null;
  gbe_score?: string | null;
  tr_salary?: number | null;
  tr_availability?: string | null;
  tr_asking_price?: number | null;
  tr_data?: Record<string, unknown> | null;
  tm_status?: 'pending' | 'ok' | 'failed' | null;
  tr_status?: 'pending' | 'ok' | 'failed' | null;
  /** Why TransferRoom gave up, when tr_status is 'failed'. Cleared on success. */
  tr_fail_reason?: string | null;
  enrichment_notes?: string | null;

  // Roster tenure. A player out on loan has two clubs and two live contracts:
  // `contract_end` is the registration holder's deal — when he can be sold or
  // goes free — and `loan_contract_end` is when he returns. `current_club` is
  // whoever he actually plays for now.
  tenure?: 'permanent' | 'loan' | 'free_agent' | null;
  owner_club?: string | null;
  owner_league?: string | null;
  loan_club?: string | null;
  loan_league?: string | null;
  loan_contract_end?: string | null;
  data_provenance?: Record<string, 'verified' | 'transfermarkt' | 'placeholder'> | null;
}

export type BallInCourt = 'us' | 'them';
export type ClubTrack = 'none' | 'enquiring' | 'bid_in' | 'fee_agreed';
export type PlayerTrack = 'none' | 'talking' | 'agreed';
export type LossReason = 'walked' | 'rejected' | 'lost' | 'collapsed';

export type MilestoneKey =
  | 'enquiry_sent'
  | 'bid_submitted'
  | 'fee_agreed'
  | 'terms_agreed'
  | 'medical'
  | 'registered';

export type MilestoneEntry = { at?: string; amount?: number | null; in_progress?: boolean };
export type Milestones = Partial<Record<MilestoneKey, MilestoneEntry>>;

export type NegotiationType =
  | 'Transfer'
  | 'Loan'
  | 'Loan with Option to Buy'
  | 'Loan with Obligation to Buy'
  | 'Free Agent';

export const NEGOTIATION_TYPES: NegotiationType[] = [
  'Transfer',
  'Loan',
  'Loan with Option to Buy',
  'Loan with Obligation to Buy',
  'Free Agent',
];

export const LOAN_TYPES_WITH_TRIGGER: NegotiationType[] = [
  'Loan with Option to Buy',
  'Loan with Obligation to Buy',
];

export interface BuyPitch {
  id: string;
  scouted_target_id: string;
  contact_id: string;
  stage: BuyPitchStage;
  asking_price: number | null;
  current_offer: number | null;
  final_price: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
  ball_in_court: BallInCourt | null;
  club_track: ClubTrack;
  player_track: PlayerTrack;
  loss_reason: LossReason | null;
  mwp: number | null;
  milestones: Milestones;
  negotiation_type: NegotiationType | null;
  loan_trigger_value: number | null;
}

export interface BuyPitchAttachment {
  path: string;
  name: string;
  size?: number;
  type?: string;
}

export interface BuyPitchNote {
  id: string;
  buy_pitch_id: string;
  note: string;
  logged_by: string;
  created_at: string;
  attachments: BuyPitchAttachment[];
}

export interface BuyNegotiationEntry {
  id: string;
  buy_pitch_id: string;
  entry_type: string;
  amount: number | null;
  note: string;
  logged_by: string;
  created_at: string;
}

// ─── Stage model ─────────────────────────────────────────

export const BUY_ACTIVE_STAGES = ['Enquiry', 'Negotiation', 'Closing'] as const;
export const BUY_CLOSED_STAGES = ['Signed', 'Walked', 'Rejected', 'Lost', 'Collapsed'] as const;
export const BUY_ALL_STAGES = [...BUY_ACTIVE_STAGES, ...BUY_CLOSED_STAGES] as const;
export type BuyPitchStage = typeof BUY_ALL_STAGES[number];

// Expected-realization bands per stage (tunable placeholders).
export const BUY_ER_BANDS: Record<BuyPitchStage, number> = {
  Enquiry: 0.20,
  Negotiation: 0.45,
  Closing: 0.85,
  Signed: 1.0,
  Walked: 0,
  Rejected: 0,
  Lost: 0,
  Collapsed: 0,
};

// Free-text entry type used for non-price log lines (reopen, route change).
// The auto-sync in the detail modal only matches 'Our Offer' / 'Their Ask' /
// 'Their Counter' / 'Agreement', so anything else is neutral by definition.
export const NEUTRAL_ENTRY_TYPE = 'Note' as const;

// Closed-stage → loss_reason mapping (Signed has no loss reason).
export const CLOSED_STAGE_TO_LOSS_REASON: Record<string, LossReason | null> = {
  Signed: null,
  Walked: 'walked',
  Rejected: 'rejected',
  Lost: 'lost',
  Collapsed: 'collapsed',
};

function slugify(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function fmtDdMmYyyy(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

// ─── Scouted Targets ─────────────────────────────────────

export function useScoutedTargets() {
  return useQuery({
    queryKey: ['scouted_targets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scouted_targets' as any)
        .select('*')
        .order('name');
      if (error) throw error;
      return data as unknown as ScoutedTarget[];
    },
  });
}

export function useAddScoutedTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (target: Omit<ScoutedTarget, 'id' | 'created_at' | 'updated_at' | 'slug'> & { slug?: string }) => {
      const slug = target.slug || slugify(target.name);
      const { data, error } = await supabase
        .from('scouted_targets' as any)
        .insert({ ...target, slug } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scouted_targets'] }),
  });
}

export function useUpdateScoutedTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ScoutedTarget> & { id: string }) => {
      const { error } = await supabase
        .from('scouted_targets' as any)
        .update(updates as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scouted_targets'] }),
  });
}

export function useDeleteScoutedTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('scouted_targets' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scouted_targets'] }),
  });
}

// ─── Buy Pitches ─────────────────────────────────────────

export function useBuyPitches() {
  return useQuery({
    queryKey: ['buy_pitches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('buy_pitches' as any)
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as BuyPitch[];
    },
  });
}

/**
 * Reopen-aware upsert. ONE pitch per scouted_target.
 *
 *  - No pitch exists           → INSERT at 'Approval' / empty milestones. On a
 *                                23505 race, re-select and return the winner.
 *  - Pitch exists & active     → return existing (action='opened').
 *  - Pitch exists & closed     → REOPEN: stage='Approval', clear loss_reason,
 *                                ball_in_court, tracks, milestones; log a
 *                                NEUTRAL_ENTRY_TYPE entry.
 *
 * Intentionally NOT optimistic — branches on the read.
 */
export function useAddBuyPitch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      scouted_target_id: string;
      contact_id: string;
      notes?: string;
    }): Promise<{ pitch: BuyPitch; action: 'created' | 'opened' | 'reopened' }> => {
      const { scouted_target_id, contact_id, notes = '' } = input;

      // 1. Existing?
      const { data: existing, error: selErr } = await supabase
        .from('buy_pitches' as any)
        .select('*')
        .eq('scouted_target_id', scouted_target_id)
        .maybeSingle();
      if (selErr) throw selErr;

      const closedStrings = BUY_CLOSED_STAGES as readonly string[];

      if (existing) {
        const ex = existing as unknown as BuyPitch;
        if (!closedStrings.includes(ex.stage)) {
          return { pitch: ex, action: 'opened' };
        }
        // Reopen
        const prevStage = ex.stage;
        const prevLoss = ex.loss_reason;
        const { data: reopened, error: upErr } = await supabase
          .from('buy_pitches' as any)
          .update({
            stage: 'Enquiry',
            loss_reason: null,
            ball_in_court: null,
            club_track: 'none',
            player_track: 'none',
            milestones: {},
            updated_at: new Date().toISOString(),
          } as any)
          .eq('id', ex.id)
          .select()
          .single();
        if (upErr) throw upErr;
        await supabase.from('buy_negotiation_entries' as any).insert({
          buy_pitch_id: ex.id,
          entry_type: NEUTRAL_ENTRY_TYPE,
          amount: null,
          note: `Re-opened ${fmtDdMmYyyy(new Date())} (was ${prevStage}${prevLoss ? `/${prevLoss}` : ''})`,
          logged_by: 'system',
        } as any);
        return { pitch: reopened as unknown as BuyPitch, action: 'reopened' };
      }

      // 2. Insert
      try {
        const { data: created, error: insErr } = await supabase
          .from('buy_pitches' as any)
          .insert({
            scouted_target_id,
            contact_id,
            stage: 'Enquiry',
            asking_price: null,
            current_offer: null,
            final_price: null,
            notes,
            ball_in_court: null,
            club_track: 'none',
            player_track: 'none',
            loss_reason: null,
            mwp: null,
            milestones: {},
          } as any)
          .select()
          .single();
        if (insErr) throw insErr;
        return { pitch: created as unknown as BuyPitch, action: 'created' };
      } catch (e: any) {
        // 23505 = unique_violation (lost a race). Re-read & return the winner.
        if (e?.code === '23505' || /duplicate key/i.test(String(e?.message))) {
          const { data: winner } = await supabase
            .from('buy_pitches' as any)
            .select('*')
            .eq('scouted_target_id', scouted_target_id)
            .single();
          return { pitch: winner as unknown as BuyPitch, action: 'opened' };
        }
        throw e;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['buy_pitches'] }),
  });
}

export function useUpdateBuyPitch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<BuyPitch> & { id: string }) => {
      const { error } = await supabase
        .from('buy_pitches' as any)
        .update(updates as any)
        .eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, ...updates }) => {
      await qc.cancelQueries({ queryKey: ['buy_pitches'] });
      const prev = qc.getQueryData<BuyPitch[]>(['buy_pitches']);
      qc.setQueryData<BuyPitch[]>(['buy_pitches'], (old = []) =>
        old.map(p => (p.id === id ? { ...p, ...(updates as Partial<BuyPitch>) } : p))
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['buy_pitches'], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['buy_pitches'] }),
  });
}

export function useDeleteBuyPitch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('buy_pitches' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['buy_pitches'] }),
  });
}

// ─── Specialized optimistic mutations ────────────────────

function optimisticPitchPatch<T extends Partial<BuyPitch>>(
  qc: ReturnType<typeof useQueryClient>,
  id: string,
  patch: T,
) {
  const prev = qc.getQueryData<BuyPitch[]>(['buy_pitches']);
  qc.setQueryData<BuyPitch[]>(['buy_pitches'], (old = []) =>
    old.map(p => (p.id === id ? { ...p, ...patch } : p))
  );
  return prev;
}

export function useSetBallInCourt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, value }: { id: string; value: BallInCourt | null }) => {
      const { error } = await supabase
        .from('buy_pitches' as any)
        .update({ ball_in_court: value } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, value }) => {
      await qc.cancelQueries({ queryKey: ['buy_pitches'] });
      return { prev: optimisticPitchPatch(qc, id, { ball_in_court: value }) };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(['buy_pitches'], ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: ['buy_pitches'] }),
  });
}

export function useSetTracks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, club_track, player_track }: { id: string; club_track?: ClubTrack; player_track?: PlayerTrack }) => {
      const patch: any = {};
      if (club_track !== undefined) patch.club_track = club_track;
      if (player_track !== undefined) patch.player_track = player_track;
      const { error } = await supabase.from('buy_pitches' as any).update(patch).eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, club_track, player_track }) => {
      await qc.cancelQueries({ queryKey: ['buy_pitches'] });
      const patch: Partial<BuyPitch> = {};
      if (club_track !== undefined) patch.club_track = club_track;
      if (player_track !== undefined) patch.player_track = player_track;
      return { prev: optimisticPitchPatch(qc, id, patch) };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(['buy_pitches'], ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: ['buy_pitches'] }),
  });
}

export function useSetMilestone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, key, entry, milestones }: { id: string; key: MilestoneKey; entry: MilestoneEntry | null; milestones: Milestones }) => {
      const next: Milestones = { ...milestones };
      if (entry === null) delete next[key];
      else next[key] = entry;
      const { error } = await supabase
        .from('buy_pitches' as any)
        .update({ milestones: next } as any)
        .eq('id', id);
      if (error) throw error;
      return next;
    },
    onMutate: async ({ id, key, entry, milestones }) => {
      await qc.cancelQueries({ queryKey: ['buy_pitches'] });
      const next: Milestones = { ...milestones };
      if (entry === null) delete next[key];
      else next[key] = entry;
      return { prev: optimisticPitchPatch(qc, id, { milestones: next }) };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(['buy_pitches'], ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: ['buy_pitches'] }),
  });
}

export function useSetLossReason() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, stage, loss_reason }: { id: string; stage: BuyPitchStage; loss_reason: LossReason | null }) => {
      const { error } = await supabase
        .from('buy_pitches' as any)
        .update({ stage, loss_reason } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, stage, loss_reason }) => {
      await qc.cancelQueries({ queryKey: ['buy_pitches'] });
      return { prev: optimisticPitchPatch(qc, id, { stage, loss_reason }) };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(['buy_pitches'], ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: ['buy_pitches'] }),
  });
}

/**
 * Change the counterparty on a pitch. Updates contact_id AND auto-writes a
 * neutral negotiation-log entry. Does NOT create a new pitch.
 */
export function useChangeBuyPitchCounterparty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, contact_id, fromLabel, toLabel }: { id: string; contact_id: string; fromLabel: string; toLabel: string }) => {
      const { error } = await supabase
        .from('buy_pitches' as any)
        .update({ contact_id } as any)
        .eq('id', id);
      if (error) throw error;
      await supabase.from('buy_negotiation_entries' as any).insert({
        buy_pitch_id: id,
        entry_type: NEUTRAL_ENTRY_TYPE,
        amount: null,
        note: `Route changed: ${fromLabel} → ${toLabel}`,
        logged_by: 'system',
      } as any);
    },
    onMutate: async ({ id, contact_id }) => {
      await qc.cancelQueries({ queryKey: ['buy_pitches'] });
      return { prev: optimisticPitchPatch(qc, id, { contact_id }) };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(['buy_pitches'], ctx.prev),
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: ['buy_pitches'] });
      qc.invalidateQueries({ queryKey: ['buy_negotiation_entries', vars.id] });
    },
  });
}

// ─── Buy Pitch Notes ─────────────────────────────────────

export function useBuyPitchNotes(pitchId: string) {
  return useQuery({
    queryKey: ['buy_pitch_notes', pitchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('buy_pitch_notes' as any)
        .select('*')
        .eq('buy_pitch_id', pitchId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as BuyPitchNote[];
    },
    enabled: !!pitchId,
  });
}

export function useAddBuyPitchNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (note: Omit<BuyPitchNote, 'id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('buy_pitch_notes' as any)
        .insert(note as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['buy_pitch_notes', vars.buy_pitch_id] }),
  });
}

// ─── Buy Negotiation Entries ─────────────────────────────

export function useBuyNegotiationEntries(pitchId: string) {
  return useQuery({
    queryKey: ['buy_negotiation_entries', pitchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('buy_negotiation_entries' as any)
        .select('*')
        .eq('buy_pitch_id', pitchId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as unknown as BuyNegotiationEntry[];
    },
    enabled: !!pitchId,
  });
}

export function useAddBuyNegotiationEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entry: Omit<BuyNegotiationEntry, 'id' | 'created_at'>) => {
      const { data, error } = await supabase
        .from('buy_negotiation_entries' as any)
        .insert(entry as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['buy_negotiation_entries', vars.buy_pitch_id] }),
  });
}

export function useDeleteBuyNegotiationEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, buy_pitch_id }: { id: string; buy_pitch_id: string }) => {
      const { error } = await supabase.from('buy_negotiation_entries' as any).delete().eq('id', id);
      if (error) throw error;
      return { buy_pitch_id };
    },
    onSuccess: (_d) => qc.invalidateQueries({ queryKey: ['buy_negotiation_entries', _d.buy_pitch_id] }),
  });
}
