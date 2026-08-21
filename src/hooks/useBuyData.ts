import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { SellingTrack, BuyingTrack, PlayerTrack } from '@/lib/placementStage';

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
  /** Why Transfermarkt gave up, when tm_status is 'failed'. Cleared on success. */
  tm_fail_reason?: string | null;
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
  data_provenance?: Record<string, 'verified' | 'transfermarkt' | 'transferroom' | 'placeholder'> | null;
}

/**
 * Who the deal is waiting on. Was `us | them` under the buying-desk model,
 * where there was only ever one counterparty for "them" to mean.
 */
export type BallInCourt = 'us' | 'selling' | 'buying' | 'player';

// The three ladders live in placementStage.ts, next to the logic that reads
// them. Re-exported here so callers of this hook get them in one import.
export type { SellingTrack, BuyingTrack, PlayerTrack, Tracks } from '@/lib/placementStage';

export type LossReason = 'walked' | 'rejected' | 'lost' | 'collapsed';

/**
 * The gates a transfer passes through, in order.
 *
 * The last three are new. A deal both clubs and the player have agreed still
 * dies at a failed medical, a work permit the player does not qualify for, or
 * an international clearance that misses the registration deadline — and each
 * is a different phone call.
 */
export type MilestoneKey =
  | 'enquiry_sent'
  | 'bid_submitted'
  | 'fee_agreed'
  | 'terms_agreed'
  | 'medical'
  | 'work_permit'
  | 'itc'
  | 'registered'
  | 'announced';

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
  /** Selling side — the club holding the registration. Null for a free agent. */
  contact_id: string | null;
  /** Buying side — the club being approached. Null before anyone is sounded out. */
  buying_contact_id?: string | null;
  stage: BuyPitchStage;
  asking_price: number | null;
  current_offer: number | null;
  final_price: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
  ball_in_court: BallInCourt | null;
  /** Will the current club let him go, and for what. */
  selling_track: SellingTrack;
  /** Does the club being approached want him, and on what terms. */
  buying_track: BuyingTrack;
  /** Does he want the move — project, minutes, city, family. */
  player_track: PlayerTrack;

  // Personal terms sit on the buying side: the fee is between the clubs, the
  // wage is between the club and the player.
  salary_offer?: number | null;
  contract_years?: number | null;
  signing_bonus?: number | null;
  /** Window close, or the club's own cutoff. */
  deadline?: string | null;
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
  /**
   * Which conversation this belongs to. Rows written before the three-sided
   * model default to 'selling', which is what they were.
   */
  side?: NegotiationSide | null;
}

export type NegotiationSide = 'selling' | 'buying' | 'player' | 'internal';

/**
 * What can be said on each side.
 *
 * Kept apart because the same word means different things across the table: a
 * "counter" from the selling club is about the fee, from the buying club it is
 * about the wage.
 */
export const ENTRY_TYPES_BY_SIDE: Record<NegotiationSide, string[]> = {
  selling: ['Ask', 'Bid', 'Counter', 'Fee agreed', 'Refused', 'Note'],
  buying: ['Interest', 'Offer', 'Counter', 'Terms offered', 'Terms agreed', 'Passed', 'Note'],
  player: ['Conversation', 'Willing', 'Concern', 'Declined', 'Note'],
  internal: ['Note'],
};

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
      /** Selling side — the club holding his registration. Absent for a free agent. */
      contact_id?: string | null;
      /** Buying side — the club being approached. */
      buying_contact_id?: string | null;
      notes?: string;
    }): Promise<{ pitch: BuyPitch; action: 'created' | 'opened' | 'reopened' }> => {
      const { scouted_target_id, notes = '' } = input;
      const contact_id = input.contact_id || null;
      const buying_contact_id = input.buying_contact_id || null;

      if (!contact_id && !buying_contact_id) {
        throw new Error('A pitch needs a club on at least one side.');
      }

      // 1. Existing?
      //
      // Matched on the whole three-way pairing, not the player alone. One
      // player is offered to many clubs at once — that is the job — so keying
      // on scouted_target_id would find an unrelated pitch and quietly return
      // it instead of opening the new one.
      let q = supabase
        .from('buy_pitches' as any)
        .select('*')
        .eq('scouted_target_id', scouted_target_id);
      q = contact_id ? q.eq('contact_id', contact_id) : q.is('contact_id', null);
      q = buying_contact_id ? q.eq('buying_contact_id', buying_contact_id) : q.is('buying_contact_id', null);

      const { data: existingRows, error: selErr } = await q.limit(1);
      if (selErr) throw selErr;
      const existing = existingRows?.[0] ?? null;

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
            selling_track: 'none',
            buying_track: 'none',
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
            buying_contact_id,
            stage: 'Enquiry',
            asking_price: null,
            current_offer: null,
            final_price: null,
            notes,
            ball_in_court: null,
            selling_track: 'none',
            buying_track: 'none',
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

/**
 * Delete a pitch and everything that only existed because of it.
 *
 * Notes, negotiation entries and documents cascade in the database. Two things
 * do not, and both would outlive the deal:
 *
 *  - `follow_up_links` is polymorphic — `link_id` is text with no foreign key —
 *    so a reminder set on this pitch would survive it and show up on Pending
 *    Actions pointing at a deal that no longer exists.
 *  - Files attached to notes live in storage, which knows nothing about rows.
 *
 * Both are cleaned up before the row goes, so a failure part-way leaves the
 * pitch intact rather than stranded without its history.
 */
export function useDeleteBuyPitch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Storage first: read the paths while the notes still exist.
      const { data: notes } = await supabase
        .from('buy_pitch_notes' as any)
        .select('attachments')
        .eq('buy_pitch_id', id);

      const paths = (notes ?? [])
        .flatMap((n: any) => (Array.isArray(n.attachments) ? n.attachments : []))
        .map((a: any) => a?.path)
        .filter((path: unknown): path is string => typeof path === 'string' && path.length > 0);

      if (paths.length > 0) {
        // A file we cannot remove is litter, not a reason to keep the deal.
        const { error: storageErr } = await supabase.storage.from('pitch-attachments').remove(paths);
        if (storageErr) console.warn('Left attachments behind:', storageErr.message);
      }

      const { error: linkErr } = await supabase
        .from('follow_up_links' as any)
        .delete()
        .eq('link_type', 'buy_pitch')
        .eq('link_id', id);
      if (linkErr) throw linkErr;

      const { error } = await supabase.from('buy_pitches' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['buy_pitches'] });
      // A reminder that lost its only link should stop showing as outstanding.
      qc.invalidateQueries({ queryKey: ['follow_ups'] });
    },
  });
}

// ─── Specialized optimistic mutations ────────────────────

/**
 * Undo an optimistic change the database refused, and say so.
 *
 * Rolling back silently is why a rejected write reads as a button that does
 * nothing: the chip lights up, the row never changes, and the UI puts it back
 * with no explanation. A constraint the schema and the code disagree about can
 * sit there for a whole session looking like a UI bug.
 */
function rollback(qc: ReturnType<typeof useQueryClient>, ctx: { prev?: unknown } | undefined, e: unknown) {
  if (ctx?.prev) qc.setQueryData(['buy_pitches'], ctx.prev);
  toast.error(e instanceof Error ? e.message : 'That change was rejected');
}

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
    onError: (e, _v, ctx) => rollback(qc, ctx, e),
    onSettled: () => qc.invalidateQueries({ queryKey: ['buy_pitches'] }),
  });
}

export function useSetTracks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, selling_track, buying_track, player_track }: {
      id: string;
      selling_track?: SellingTrack;
      buying_track?: BuyingTrack;
      player_track?: PlayerTrack;
    }) => {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (selling_track !== undefined) patch.selling_track = selling_track;
      if (buying_track !== undefined) patch.buying_track = buying_track;
      if (player_track !== undefined) patch.player_track = player_track;
      const { error } = await supabase.from('buy_pitches' as any).update(patch as any).eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, selling_track, buying_track, player_track }) => {
      await qc.cancelQueries({ queryKey: ['buy_pitches'] });
      const patch: Record<string, unknown> = {};
      if (selling_track !== undefined) patch.selling_track = selling_track;
      if (buying_track !== undefined) patch.buying_track = buying_track;
      if (player_track !== undefined) patch.player_track = player_track;
      return { prev: optimisticPitchPatch(qc, id, patch as Partial<BuyPitch>) };
    },
    onError: (e, _v, ctx) => rollback(qc, ctx, e),
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
    onError: (e, _v, ctx) => rollback(qc, ctx, e),
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
    onError: (e, _v, ctx) => rollback(qc, ctx, e),
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
    onError: (e, _v, ctx) => rollback(qc, ctx, e),
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
