// Reads a Transfermarkt agency page and returns every player it represents.
//
// tm-fetch handles one player profile at a time, which means onboarding a roster
// by hand: find each player, copy each URL. This takes the agency's own page —
// e.g. https://www.transfermarkt.com.br/<agency>/beraterfirma/berater/<id> — and
// returns the player links found on it, so the whole roster can be imported in
// one paste and then enriched player-by-player through the existing pipeline.
//
// Fails soft, like tm-fetch: { ok: false, reason } on block, timeout or parse
// failure. Never throws at the caller.

import { requireAdmin } from '../_shared/requireAdmin.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,pt;q=0.8,de;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Upgrade-Insecure-Requests': '1',
};

/** Agency / agent pages. Transfermarkt uses both `beraterfirma` and `berater`. */
const AGENCY_URL_RE =
  /^https?:\/\/[^\s]*transfermarkt\.[a-z.]+\/[^\s]*\/(?:beraterfirma|berater)\/berater\/(\d+)/i;

/** Player profile links inside the page. */
const PLAYER_LINK_RE =
  /href="(\/[^"]*?\/profil\/spieler\/(\d+))"[^>]*>([^<]*)</gi;

/**
 * Named entities Transfermarkt emits for accented Latin characters, plus the
 * numeric forms. A Brazilian roster is full of ã, ç, õ and é, so decoding only
 * the numeric forms leaves names like "Luis&atilde;o" in the database.
 */
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>',
  aacute: 'á', agrave: 'à', acirc: 'â', atilde: 'ã', auml: 'ä', aring: 'å',
  eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë',
  iacute: 'í', igrave: 'ì', icirc: 'î', iuml: 'ï',
  oacute: 'ó', ograve: 'ò', ocirc: 'ô', otilde: 'õ', ouml: 'ö', oslash: 'ø',
  uacute: 'ú', ugrave: 'ù', ucirc: 'û', uuml: 'ü',
  ccedil: 'ç', ntilde: 'ñ', yacute: 'ý', szlig: 'ß',
  Aacute: 'Á', Agrave: 'À', Acirc: 'Â', Atilde: 'Ã', Auml: 'Ä', Aring: 'Å',
  Eacute: 'É', Egrave: 'È', Ecirc: 'Ê', Euml: 'Ë',
  Iacute: 'Í', Igrave: 'Ì', Icirc: 'Î', Iuml: 'Ï',
  Oacute: 'Ó', Ograve: 'Ò', Ocirc: 'Ô', Otilde: 'Õ', Ouml: 'Ö', Oslash: 'Ø',
  Uacute: 'Ú', Ugrave: 'Ù', Ucirc: 'Û', Uuml: 'Ü',
  Ccedil: 'Ç', Ntilde: 'Ñ',
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-zA-Z]+);/g, (whole, name) => NAMED_ENTITIES[name] ?? whole);
}

interface FoundPlayer {
  tmPlayerId: string;
  name: string;
  url: string;
}

function extractPlayers(html: string, origin: string): FoundPlayer[] {
  const byId = new Map<string, FoundPlayer>();

  for (const m of html.matchAll(PLAYER_LINK_RE)) {
    const path = m[1];
    const tmPlayerId = m[2];
    const name = decodeEntities(m[3] || '').trim();

    // The same player appears more than once per row (crest link, name link).
    // Keep whichever occurrence carried a readable name.
    const existing = byId.get(tmPlayerId);
    if (existing && (existing.name || !name)) continue;

    byId.set(tmPlayerId, { tmPlayerId, name, url: `${origin}${path}` });
  }

  return [...byId.values()];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  // Auth: signed in AND an admin, same gate as tm-fetch.
  const gate = await requireAdmin(req, corsHeaders);
  if (!gate.ok) return gate.response;

  let body: { agencyUrl?: string } = {};
  try { body = await req.json(); } catch (_) { /* handled below */ }

  const agencyUrl = (body.agencyUrl || '').trim();
  if (!AGENCY_URL_RE.test(agencyUrl)) {
    return json({ ok: false, reason: 'invalid_url' }, 400);
  }

  let origin: string;
  try {
    origin = new URL(agencyUrl).origin;
  } catch (_) {
    return json({ ok: false, reason: 'invalid_url' }, 400);
  }

  let html: string;
  try {
    const r = await fetch(agencyUrl, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(12_000),
    });
    if (!r.ok) return json({ ok: false, reason: `http_${r.status}` });
    html = await r.text();
  } catch (e) {
    const blocked = String(e).includes('Timeout') || String(e).includes('abort');
    return json({ ok: false, reason: blocked ? 'timeout' : 'fetch_failed' });
  }

  const players = extractPlayers(html, origin);

  if (players.length === 0) {
    // Either the markup moved or the page was served as a challenge. Either way
    // an empty roster is a failure, not a legitimately empty agency — say so
    // rather than reporting success with nothing in it.
    return json({ ok: false, reason: 'no_players_found' });
  }

  return json({
    ok: true,
    agencyUrl,
    count: players.length,
    players,
  });
});
