// TransferRoom enrichment for a scouted target.
//
// Strategy (matches the rest of the codebase):
//   1. Resolve the club to tr_team_id + tr_competition_id via the clubs table.
//      No mapping → return {ok:false, reason:'club_not_mapped'} so the UI can
//      show a real, useful state instead of a phantom "search" failure.
//   2. Fetch the entire competition roster via tr-proxy /players?competitionid=X.
//      Reuse the existing 24h cache in tr_competition_players_cache.
//   3. Filter that roster in-memory by the club's tr_team_id (TR's team filter
//      param is silently ignored — confirmed in generate-club-brief).
//   4. Score the ~25 team players by normalized name; break ties with DOB.
//   5. Fetch /players?playerid=Y for full record (xTV, GBE, salary, etc.).
//
// Input:  { name: string, dob?: string|null, club: string, league?: string|null, trPlayerId?: number }
// Output: { ok: true, data: {...}, raw: {...} } | { ok: false, reason: string, ... }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAdmin } from '../_shared/requireAdmin.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Resolve the proxy from this project's own URL. Hardcoding it here previously
// pointed every deployment at one specific Supabase project.
const PROXY_BASE = `${Deno.env.get('SUPABASE_URL')}/functions/v1/tr-proxy`;
const TEAM_ID_FIELDS = ['CurrentTeamTRId', 'TeamTRId', 'ClubTRId', 'CurrentTeamId', 'TeamId', 'ClubId'];

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

function normalize(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreName(candidate: string, target: string): number {
  const c = normalize(candidate);
  const t = normalize(target);
  if (!c || !t) return 0;
  if (c === t) return 100;
  if (c.includes(t) || t.includes(c)) return 70;
  const cs = new Set(c.split(' '));
  const ts = new Set(t.split(' '));
  const common = [...cs].filter((x) => ts.has(x)).length;
  const total = Math.max(cs.size, ts.size);
  return total > 0 ? Math.round((common / total) * 60) : 0;
}

async function callProxy(path: string, token: string) {
  const r = await fetch(`${PROXY_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30000),
  });
  let json: any = null;
  try { json = await r.json(); } catch { /* non-JSON body — caller checks `ok` */ }
  return { ok: r.ok, status: r.status, json };
}

async function getCompetitionRoster(
  competitionId: number,
  proxyToken: string,
  admin: ReturnType<typeof createClient>,
): Promise<{ ok: true; players: any[] } | { ok: false; reason: string }> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: cacheRow } = await admin
    .from('tr_competition_players_cache')
    .select('players_json, fetched_at')
    .eq('competition_id', competitionId)
    .gte('fetched_at', twentyFourHoursAgo)
    .maybeSingle();

  if (cacheRow?.players_json && Array.isArray(cacheRow.players_json)) {
    return { ok: true, players: cacheRow.players_json as any[] };
  }

  const res = await callProxy(`/players?competitionid=${competitionId}`, proxyToken);
  if (!res.ok) return { ok: false, reason: `proxy_${res.status}` };
  if (!Array.isArray(res.json)) return { ok: false, reason: 'tr_response_not_array' };

  await admin.from('tr_competition_players_cache').upsert(
    { competition_id: competitionId, players_json: res.json, fetched_at: new Date().toISOString() },
    { onConflict: 'competition_id' },
  );
  return { ok: true, players: res.json };
}

function mapPlayer(player: any) {
  const trId = player?.PlayerId ?? player?.playerId ?? player?.Id ?? player?.id ?? null;
  const xtvRaw = player?.XTV ?? player?.xTV ?? player?.ExpectedTransferValue ?? null;
  const xtvAsOf = player?.XTVAsOfDate ?? player?.XTVDate ?? player?.AsOfDate ?? null;
  const dob = player?.DateOfBirth ?? player?.BirthDate ?? null;
  const dobIso = dob ? String(dob).slice(0, 10) : null;
  let age: number | null = player?.Age != null ? Number(player.Age) : null;
  if (!age && dobIso) {
    const d = new Date(dobIso);
    if (!isNaN(d.getTime())) age = Math.floor((Date.now() - d.getTime()) / (365.25 * 86400 * 1000));
  }
  const positionRaw = player?.Position ?? player?.PositionText ?? player?.FirstPosition ?? null;
  const contractRaw = player?.ContractExpiry ?? player?.ContractEnd ?? null;
  const contract = contractRaw ? String(contractRaw).slice(0, 10) : null;
  const heightRaw = player?.Height ?? player?.HeightCm ?? null;
  const height = heightRaw ? (typeof heightRaw === 'number' ? `${heightRaw}cm` : String(heightRaw)) : null;
  const foot = player?.PreferredFoot ?? player?.Foot ?? null;
  const photo = player?.ImageUrl ?? player?.PictureUrl ?? player?.PhotoUrl ?? player?.Image ?? null;
  const nationality = player?.Nationality ?? player?.NationalityName ?? player?.Country ?? null;
  const marketValue = num(player?.MarketValue ?? player?.Marketvalue);
  return {
    tr_player_id: trId ? Number(trId) : null,
    xtv: num(xtvRaw),
    xtv_as_of: xtvAsOf ? String(xtvAsOf).slice(0, 10) : null,
    gbe_score: player?.GBEScore ?? player?.GBE ?? player?.GbeScore ?? null,
    tr_salary: num(player?.EstimatedSalary ?? player?.Salary ?? player?.AnnualSalary),
    tr_availability: player?.Availability ?? player?.AvailabilityStatus ?? null,
    tr_asking_price: num(player?.AskingPrice ?? player?.AskPrice),
    // Bio fields — UI may use these to backfill when TM is missing/failed
    position: positionRaw,
    date_of_birth: dobIso,
    age,
    nationality,
    height,
    foot,
    contract_end: contract,
    market_value: marketValue,
    photo_url: photo,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // ── Auth: caller must be signed in AND an admin ──
  // Below this line the function spends TransferRoom quota and then writes
  // through a service-role client that bypasses RLS. "Signed in" was never a
  // sufficient bar for either.
  const gate = await requireAdmin(req, corsHeaders);
  if (!gate.ok) return gate.response;

  const proxyToken = Deno.env.get('TR_PROXY_BEARER_TOKEN');
  if (!proxyToken) return json({ ok: false, reason: 'proxy_not_configured' }, 500);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let body: {
    name?: string; dob?: string | null; club?: string | null;
    league?: string | null; trPlayerId?: number;
  } = {};
  try { body = await req.json(); } catch { /* no body — validated below */ }
  const name = (body.name || '').trim();
  const dob = body.dob ? String(body.dob).slice(0, 10) : null;
  const club = (body.club || '').trim();
  const league = (body.league || '').trim() || null;

  try {
    // ── Direct path: caller already knows TR PlayerId ──
    if (body.trPlayerId) {
      const r = await callProxy(`/players?playerid=${body.trPlayerId}`, proxyToken);
      if (!r.ok) return json({ ok: false, reason: `proxy_${r.status}` });
      const p = Array.isArray(r.json) ? r.json[0] : r.json;
      if (!p) return json({ ok: false, reason: 'no_match' });
      return json({ ok: true, data: mapPlayer(p), raw: p });
    }

    if (!name) return json({ ok: false, reason: 'name_required' }, 400);
    if (!club) return json({ ok: false, reason: 'club_required' }, 400);

    // ── 1. Resolve club → tr_team_id + tr_competition_id ──
    // Try exact match scoped by league first, then fall back to name-only.
    let clubRow: { tr_team_id: number | null; tr_competition_id: number | null; name: string } | null = null;
    if (league) {
      const { data } = await admin
        .from('clubs')
        .select('name, tr_team_id, tr_competition_id')
        .eq('name', club)
        .eq('league', league)
        .maybeSingle();
      clubRow = data as any;
    }
    if (!clubRow) {
      const { data } = await admin
        .from('clubs')
        .select('name, tr_team_id, tr_competition_id')
        .eq('name', club)
        .limit(1)
        .maybeSingle();
      clubRow = data as any;
    }

    if (!clubRow) return json({ ok: false, reason: 'club_not_in_clubs_table', club });
    if (!clubRow.tr_team_id || !clubRow.tr_competition_id) {
      return json({ ok: false, reason: 'club_not_mapped_to_tr', club: clubRow.name });
    }

    // ── 2. Fetch competition roster (cached 24h) ──
    const roster = await getCompetitionRoster(clubRow.tr_competition_id, proxyToken, admin);
    if (!roster.ok) return json({ ok: false, reason: roster.reason });

    // ── 3. Filter to the team ──
    const teamRoster = roster.players.filter((p) =>
      p && typeof p === 'object'
      && TEAM_ID_FIELDS.some((f) => Number((p as any)[f]) === Number(clubRow!.tr_team_id))
    );
    if (teamRoster.length === 0) {
      return json({ ok: false, reason: 'team_not_in_competition_pool' });
    }

    // ── 4. Score by name; break ties with DOB ──
    const ranked = teamRoster.map((p) => {
      let score = scoreName(String(p?.Name ?? p?.name ?? ''), name);
      const pDob = String(p?.DateOfBirth ?? p?.BirthDate ?? '').slice(0, 10);
      if (dob && pDob && pDob === dob) score += 50;
      return { p, score, pDob };
    }).sort((a, b) => b.score - a.score);

    const best = ranked[0];
    if (!best || best.score < 40) {
      return json({
        ok: false,
        reason: 'no_match',
        team_roster_size: teamRoster.length,
        top_candidates: ranked.slice(0, 3).map((r) => ({
          name: r.p?.Name ?? r.p?.name, dob: r.pDob, score: r.score,
        })),
      });
    }

    // ── 5. Fetch full player details ──
    const pickId = best.p?.PlayerId ?? best.p?.playerId ?? best.p?.Id ?? best.p?.id;
    let detail = best.p;
    if (pickId) {
      const r = await callProxy(`/players?playerid=${pickId}`, proxyToken);
      if (r.ok && r.json) detail = Array.isArray(r.json) ? r.json[0] : r.json;
    }

    return json({ ok: true, data: mapPlayer(detail), raw: detail });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ ok: false, reason: 'error', message: msg });
  }
});
