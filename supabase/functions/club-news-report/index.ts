// Read a club's news sources and write the report an agent would want before
// picking up the phone.
//
// Adapted from the Botafogo desk's `generate-club-brief`, which is 1,551 lines
// and mostly TransferRoom — roster fetches, xTV floors, position intel, a
// buy/sell/scout prompt. None of that is this feature. What came across is the
// page-to-text extraction and the overall shape.
//
// Fails soft the way the rest of this desk does: a source that blocks us is
// recorded and the report is written from the rest, rather than the whole run
// dying because Sky Sports served a 403.

import Anthropic from 'npm:@anthropic-ai/sdk@0.120.0';
import { z } from 'npm:zod@4.4.3';
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk@0.120.0/helpers/zod';
import { requireAdmin } from '../_shared/requireAdmin.ts';
import { fetchAndExtractText, type SourceText } from '../_shared/htmlText.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Enough to be worth reading, few enough to finish inside the function's wall clock. */
const MAX_SOURCES = 8;

/** Leaves headroom under the edge runtime's limit, so we fail with a message rather than being killed. */
const ANTHROPIC_TIMEOUT_MS = 110_000;

const ReportSchema = z.object({
  headline: z.string().describe('One line: what matters about this club right now.'),
  as_of: z.string().describe('Date the report reflects, YYYY-MM-DD.'),
  stories: z.array(z.object({
    title: z.string(),
    summary: z.string().describe('At most 60 words.'),
    category: z.enum(['transfer', 'contract', 'management', 'performance', 'financial', 'other']),
    relevance: z.enum(['high', 'medium', 'low'])
      .describe('Relevance to a football agency representing players, not to a fan.'),
    source_url: z.string().describe('The URL this came from. Never invent one.'),
    source_name: z.string(),
    published_hint: z.string().describe('Whatever date the source gave, verbatim. Empty string if none.'),
  })),
  agency_angle: z.array(z.string())
    .describe('What this means for the agency: who to pitch, which need it opens, what to ask about.'),
  gaps: z.string()
    .describe('What the sources did not cover, so a thin report does not read as a quiet week.'),
});

const SYSTEM_PROMPT = `You are an analyst at AVI, a football agency that represents players and
places them with clubs. You are writing the note an agent reads in the two minutes before they
call a sporting director.

You will be given the text of that club's news sources, each one labelled, plus the club's name
and country. You also have web search — use it to fill gaps and to check anything the pages
imply but do not state.

Rules that matter more than style:

- Every story must carry the URL it came from. If you learned it from web search, cite that
  page. Never attribute a claim to a source that did not make it, and never write a URL you did
  not actually see.
- Rank by what changes an agent's day, not by what is loudest. A contract running down, a
  manager change, a sale that opens a hole in a position — those beat a match report.
- If the supplied pages were thin or blocked, say so in \`gaps\` and lean on search. A short,
  honest report is worth more than a padded one; do not invent stories to fill space.
- \`agency_angle\` is the point of the whole document. It is not a summary of the stories — it
  is what AVI should do about them. If nothing in the news creates an opening, say that.
- Rumour is fine to include, labelled as rumour in the summary. Presenting it as settled is not.
- Output language: English, whatever the sources are in. Currency: EUR.

Aim for 5-10 stories and 3-6 agency_angle points. Fewer if the news genuinely is not there.`;

interface ClubRow {
  id: string;
  name: string;
  country: string | null;
  league: string | null;
}

function assembleContext(club: ClubRow, sources: SourceText[], today: string): string {
  const usable = sources.filter((s) => !s.error && s.text.length > 0);
  const parts = [
    `CLUB: ${club.name}`,
    `COUNTRY: ${club.country ?? 'unknown'}`,
    `LEAGUE: ${club.league ?? 'unknown'}`,
    `TODAY: ${today}`,
    '',
  ];

  if (usable.length === 0) {
    // Said plainly rather than left as an empty section. A model handed nothing
    // will otherwise assume the club had a quiet week and write that.
    parts.push(
      'NO SOURCE PAGES COULD BE READ. Every configured source failed or returned nothing.',
      'Build the report from web search alone and say so in `gaps`.',
      '',
      'SOURCE FAILURES:',
      ...sources.map((s) => `- ${s.identifier} ${s.url} -> ${s.error ?? 'empty'}`),
    );
    return parts.join('\n');
  }

  for (const s of usable) {
    parts.push(`--- SOURCE ${s.identifier} (${s.url}) ---`, s.text, '');
  }

  const failed = sources.filter((s) => s.error || s.text.length === 0);
  if (failed.length > 0) {
    parts.push(
      'SOURCES THAT COULD NOT BE READ (mention in `gaps`):',
      ...failed.map((s) => `- ${s.identifier} ${s.url} -> ${s.error ?? 'empty'}`),
    );
  }

  return parts.join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const started = Date.now();
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  // Signed in is not permission: this spends metered Anthropic credit and the
  // output names who the agency should pitch.
  const gate = await requireAdmin(req, corsHeaders);
  if (!gate.ok) return gate.response;
  const { userClient, userId } = gate.caller;

  let body: { club_id?: string } = {};
  try { body = await req.json(); } catch { /* handled below */ }
  const clubId = body.club_id;
  if (!clubId || typeof clubId !== 'string') {
    return json({ ok: false, reason: 'missing_club_id' }, 400);
  }

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) {
    // Checked before doing any work, so the failure names the cause instead of
    // arriving after eight page fetches.
    return json({ ok: false, reason: 'missing_anthropic_key' }, 500);
  }

  const { data: club, error: clubErr } = await userClient
    .from('clubs')
    .select('id, name, country, league')
    .eq('id', clubId)
    .single();
  if (clubErr || !club) return json({ ok: false, reason: 'club_not_found' }, 404);

  /**
   * Every URL comes from `club_sources`, and none from the request body.
   *
   * A body-supplied list would turn this into a server-side fetcher any admin
   * could point at any host — including addresses only this server can reach.
   * The defaults in `pl_news_sources.json` get in by being written to
   * `club_sources` from the UI, where they are visible and editable, not by
   * being passed straight through to fetch().
   */
  const { data: sourceRows } = await userClient
    .from('club_sources')
    .select('label, url')
    .eq('club_id', clubId)
    .limit(MAX_SOURCES);

  const configured = sourceRows ?? [];
  if (configured.length === 0) {
    return json({ ok: false, reason: 'no_sources' }, 400);
  }

  const sources = await Promise.all(
    configured.map((s) => fetchAndExtractText(s.url, s.label)),
  );
  const sourceStatus = sources.map((s) => ({
    url: s.url,
    label: s.label,
    identifier: s.identifier,
    status: s.error ?? (s.char_count > 0 ? 'ok' : 'empty'),
    chars: s.char_count,
  }));

  const today = new Date().toISOString().slice(0, 10);
  const model = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-opus-5';
  const client = new Anthropic({ apiKey: anthropicKey, timeout: ANTHROPIC_TIMEOUT_MS });

  let response;
  try {
    response = await client.messages.parse({
      model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: assembleContext(club as ClubRow, sources, today) }],
      output_config: { effort: 'medium', format: zodOutputFormat(ReportSchema) },
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const timedOut = /timeout|abort/i.test(message);
    return json({
      ok: false,
      reason: timedOut ? 'anthropic_timeout' : 'anthropic_error',
      detail: message,
      source_status: sourceStatus,
    }, timedOut ? 504 : 502);
  }

  if (response.stop_reason === 'refusal') {
    return json({ ok: false, reason: 'refused', detail: response.stop_details?.explanation ?? null }, 502);
  }

  const report = response.parsed_output;
  if (!report) {
    // `parsed_output` is null when the model's JSON did not satisfy the schema.
    return json({ ok: false, reason: 'report_parse_failed', source_status: sourceStatus }, 502);
  }

  const searchCalls = response.usage?.server_tool_use?.web_search_requests ?? 0;
  const durationMs = Date.now() - started;

  const { data: saved, error: insertErr } = await userClient
    .from('club_news_reports')
    .insert({
      club_id: clubId,
      generated_by: userId,
      duration_ms: durationMs,
      source_status: sourceStatus,
      report_json: report,
      model,
      web_search_calls: searchCalls,
      input_tokens: response.usage?.input_tokens ?? null,
      output_tokens: response.usage?.output_tokens ?? null,
    })
    .select('id, generated_at')
    .single();

  if (insertErr) {
    // The report is the deliverable; failing to file it should not throw it away.
    console.error('club_news_reports insert failed:', insertErr);
  }

  return json({
    ok: true,
    id: saved?.id ?? null,
    generated_at: saved?.generated_at ?? new Date().toISOString(),
    report,
    source_status: sourceStatus,
    duration_ms: durationMs,
    web_search_calls: searchCalls,
  });
});
