import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ScoutedTarget } from './useBuyData';
import type { FieldProvenance } from '@/lib/rosterData';

interface EnrichArgs {
  targetId: string;
  tmUrl: string;
  name: string;
  // Authoritative dropdown selections — TM must NOT overwrite these
  current_club: string;
  league: string;
}

interface RetryArgs {
  target: ScoutedTarget;
  sources: ('tm' | 'tr')[];
}

type Patch = Partial<ScoutedTarget>;

async function runTm(target: { id: string; tmUrl: string; current_club: string }) {
  try {
    const { data, error } = await supabase.functions.invoke('tm-fetch', {
      body: { tmUrl: target.tmUrl },
    });
    if (error || !data?.ok) return { tm_status: 'failed' as const };
    const tm = data.data as Record<string, any>;
    const patch: Patch = { tm_status: 'ok' };
    if (tm.position) patch.position = tm.position;
    if (tm.age) patch.age = tm.age;
    if (tm.date_of_birth) patch.date_of_birth = tm.date_of_birth;
    if (tm.nationality) patch.nationality = tm.nationality;
    if (tm.contract_end) patch.contract_end = tm.contract_end;
    if (tm.market_value) patch.market_value = tm.market_value;
    if (tm.height) patch.height = tm.height;
    if (tm.foot) patch.foot = tm.foot;
    if (tm.photo_url) patch.photo_url = tm.photo_url;
    if (tm.current_club && tm.current_club !== target.current_club) {
      patch.enrichment_notes = `TM lists different club: ${tm.current_club}`;
    }
    return patch;
  } catch {
    return { tm_status: 'failed' as const };
  }
}

interface TrArgs {
  name: string;
  club: string;
  league?: string | null;
  dob?: string | null;
  trPlayerId?: number | null;
}

async function runTr(args: TrArgs) {
  try {
    const { data, error } = await supabase.functions.invoke('scouted-target-enrich-tr', {
      body: {
        name: args.name,
        club: args.club,
        league: args.league ?? null,
        dob: args.dob ?? null,
        trPlayerId: args.trPlayerId ?? undefined,
      },
    });
    if (error || !data?.ok) {
      // The function says why it gave up — an unmapped club is a very different
      // problem to a bad password, and both look identical without this.
      const reason = (data as any)?.reason ?? error?.message;
      return { tr_status: 'failed' as const, tr_fail_reason: reason ?? 'unknown' };
    }
    const d = data.data as Record<string, any>;
    const patch: Patch = { tr_status: 'ok', tr_data: data.raw ?? null, tr_fail_reason: null };
    // TR-only metrics
    if (d.tr_player_id) patch.tr_player_id = d.tr_player_id;
    if (d.xtv != null) patch.xtv = d.xtv;
    if (d.xtv_as_of) patch.xtv_as_of = d.xtv_as_of;
    if (d.gbe_score) patch.gbe_score = d.gbe_score;
    if (d.tr_availability) patch.tr_availability = d.tr_availability;
    if (d.tr_asking_price != null) patch.tr_asking_price = d.tr_asking_price;
    if (d.tr_salary != null) patch.tr_salary = d.tr_salary;
    // Bio fields (held aside — applied as TM backfill, not overwriting TM values)
    if (d.position) (patch as any).__tr_position = d.position;
    if (d.date_of_birth) (patch as any).__tr_date_of_birth = d.date_of_birth;
    if (d.age != null) (patch as any).__tr_age = d.age;
    if (d.nationality) (patch as any).__tr_nationality = d.nationality;
    if (d.height) (patch as any).__tr_height = d.height;
    if (d.foot) (patch as any).__tr_foot = d.foot;
    if (d.contract_end) (patch as any).__tr_contract_end = d.contract_end;
    if (d.market_value != null) (patch as any).__tr_market_value = d.market_value;
    if (d.photo_url) (patch as any).__tr_photo_url = d.photo_url;
    return patch;
  } catch {
    return { tr_status: 'failed' as const };
  }
}

const BIO_KEYS = ['position', 'date_of_birth', 'age', 'nationality', 'height', 'foot', 'contract_end', 'market_value', 'photo_url'] as const;

/**
 * Database column -> the `data_provenance` key for the same fact.
 *
 * Provenance is keyed by the camelCase field the dossier and the PDF read, so
 * writing a column without translating the name here leaves the value looking
 * unsourced and keeps it off client documents.
 */
const PROVENANCE_KEY: Record<string, string> = {
  position: 'position',
  age: 'age',
  date_of_birth: 'dob',
  nationality: 'nationality',
  height: 'height',
  foot: 'foot',
  photo_url: 'photoUrl',
  contract_end: 'contractEndDate',
  market_value: 'marketValue',
  current_club: 'currentClub',
  league: 'league',
};

async function applyPatch(id: string, patch: Patch) {
  if (Object.keys(patch).length === 0) return;
  await supabase.from('scouted_targets' as any).update(patch as any).eq('id', id);
}

/**
 * Write an enrichment patch without trampling what the agency already knows.
 *
 * Two rules, both there for the same reason: a contract date is the field an
 * agent acts on, and a wrong one sends them to a club in the wrong window.
 *
 *  1. A field the agency marked `verified` is theirs. A public source does not
 *     get to silently replace it. Where the two disagree the incoming value is
 *     dropped and the disagreement is written into enrichment_notes, so a human
 *     decides rather than the last writer winning.
 *  2. Every field this does write is stamped with the source that produced it,
 *     so the dossier can badge it and the PDF can print it.
 */
async function applyEnrichment(id: string, patch: Patch, source: FieldProvenance) {
  const values = Object.entries(patch).filter(([k]) => !k.startsWith('__tr_'));
  if (values.length === 0) return;

  const { data: row } = await supabase
    .from('scouted_targets' as any)
    .select('data_provenance, enrichment_notes, ' + Object.keys(PROVENANCE_KEY).join(','))
    .eq('id', id)
    .maybeSingle();

  const provenance: Record<string, string> = { ...((row as any)?.data_provenance ?? {}) };
  const conflicts: string[] = [];
  const write: Record<string, unknown> = {};

  for (const [column, value] of values) {
    const pKey = PROVENANCE_KEY[column];
    if (!pKey) {
      // Not a fact the documents gate on (statuses, tr_data, ids).
      write[column] = value;
      continue;
    }
    const current = (row as any)?.[column];
    const held = provenance[pKey];
    const differs = current != null && current !== '' && String(current) !== String(value);

    if (held === 'verified' && differs) {
      conflicts.push(`${column}: we hold ${current}, ${source} says ${value}`);
      continue;
    }
    write[column] = value;
    provenance[pKey] = source;
  }

  write.data_provenance = provenance;
  if (conflicts.length > 0) {
    const prior = (row as any)?.enrichment_notes;
    const note = `Conflicts with our record — ${conflicts.join('; ')}.`;
    write.enrichment_notes = prior && !prior.includes(note) ? `${prior} ${note}` : note;
  }

  await applyPatch(id, write as Patch);
}

async function applyTrWithBackfill(id: string, trPatch: Patch, tmKeys: Set<string>) {
  const bio: Record<string, any> = {};
  const main: Record<string, any> = {};
  for (const [k, v] of Object.entries(trPatch)) {
    if (k.startsWith('__tr_')) bio[k.replace('__tr_', '')] = v;
    else main[k] = v;
  }
  await applyEnrichment(id, main as Patch, 'transferroom');
  if (Object.keys(bio).length === 0) return;
  // Skip bio fields TM already filled in this run; backfill the rest only when empty
  const candidates: Record<string, any> = {};
  for (const k of BIO_KEYS) {
    if (tmKeys.has(k)) continue;
    if (bio[k] != null && bio[k] !== '') candidates[k] = bio[k];
  }
  if (Object.keys(candidates).length === 0) return;
  const { data: row } = await supabase
    .from('scouted_targets' as any)
    .select(BIO_KEYS.join(','))
    .eq('id', id)
    .maybeSingle();
  const fill: Record<string, any> = {};
  for (const [k, v] of Object.entries(candidates)) {
    const cur = (row as any)?.[k];
    if (cur == null || cur === '' || cur === 0) fill[k] = v;
  }
  if (Object.keys(fill).length > 0) await applyEnrichment(id, fill as Patch, 'transferroom');
}

/**
 * Enrich one existing row from the sources named.
 *
 * The single entry point for enriching a player already in the roster, used by
 * the per-player retry, the dossier's enrich action, and the bulk run over a
 * whole roster. Resolves to what each source did, so a caller running through
 * ninety-five players can report which ones came back empty.
 */
export async function enrichTarget(
  target: ScoutedTarget,
  sources: ('tm' | 'tr')[] = ['tm', 'tr'],
): Promise<{ tm: 'ok' | 'failed' | 'skipped'; tr: 'ok' | 'failed' | 'skipped' }> {
  const result = { tm: 'skipped' as const, tr: 'skipped' as const } as {
    tm: 'ok' | 'failed' | 'skipped';
    tr: 'ok' | 'failed' | 'skipped';
  };

  let tmKeys = new Set<string>();
  let tmDob: string | undefined;

  if (sources.includes('tm') && target.tm_link) {
    const tmRes = await runTm({ id: target.id, tmUrl: target.tm_link, current_club: target.current_club });
    await applyEnrichment(target.id, tmRes, 'transfermarkt');
    tmKeys = new Set(Object.keys(tmRes));
    tmDob = (tmRes as any)?.date_of_birth;
    result.tm = (tmRes as any)?.tm_status === 'ok' ? 'ok' : 'failed';
  }

  if (sources.includes('tr')) {
    // A date of birth is what separates two players of the same name, so if TM
    // just found one, use it before giving up on the TransferRoom match.
    let trRes = await runTr({
      name: target.name,
      club: target.current_club,
      league: target.league,
      dob: target.date_of_birth ?? tmDob ?? null,
      trPlayerId: target.tr_player_id ?? null,
    });
    if ((trRes as any)?.tr_status === 'failed' && tmDob && !target.date_of_birth) {
      trRes = await runTr({
        name: target.name, club: target.current_club, league: target.league, dob: tmDob,
      });
    }
    await applyTrWithBackfill(target.id, trRes, tmKeys);
    result.tr = (trRes as any)?.tr_status === 'ok' ? 'ok' : 'failed';
  }

  return result;
}

export function useEnrichScoutedTarget() {
  const qc = useQueryClient();

  const start = useCallback(async (args: EnrichArgs) => {
    // Run TM and TR in parallel; apply TM first, then TR with bio backfill (TM wins on bio).
    const tmPromise = runTm({ id: args.targetId, tmUrl: args.tmUrl, current_club: args.current_club });
    const trPromise = runTr({ name: args.name, club: args.current_club, league: args.league });

    const tmRes = await tmPromise;
    await applyEnrichment(args.targetId, tmRes, 'transfermarkt');
    const tmKeys = new Set(Object.keys(tmRes));

    let trRes = await trPromise;
    const tmDob = (tmRes as any)?.date_of_birth as string | undefined;
    if ((trRes as any)?.tr_status === 'failed' && tmDob) {
      trRes = await runTr({
        name: args.name, club: args.current_club, league: args.league, dob: tmDob,
      });
    }
    await applyTrWithBackfill(args.targetId, trRes, tmKeys);

    qc.invalidateQueries({ queryKey: ['scouted_targets'] });
  }, [qc]);

  const retry = useMutation({
    mutationFn: async ({ target, sources }: RetryArgs) => {
      const pendingPatch: Patch = {};
      if (sources.includes('tm')) pendingPatch.tm_status = 'pending';
      if (sources.includes('tr')) pendingPatch.tr_status = 'pending';
      await applyPatch(target.id, pendingPatch);
      qc.invalidateQueries({ queryKey: ['scouted_targets'] });
      await enrichTarget(target, sources);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scouted_targets'] }),
  });

  return { start, retry: retry.mutate, isRetrying: retry.isPending };
}
