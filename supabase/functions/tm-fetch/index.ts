// Fetches a Transfermarkt player profile and parses key fields.
// Fails soft: returns { ok: false, reason } when blocked / timeout / parse error.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

const TM_URL_RE = /^https?:\/\/[^\s]*transfermarkt\.[a-z.]+\/.+\/spieler\/(\d+)/i;

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function pickAfterLabel(html: string, label: string): string | null {
  // Matches `<span ...>Label:</span> ... <span ...>VALUE</span>` patterns
  const re = new RegExp(
    `${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]{0,200}?<span[^>]*>([\\s\\S]{1,200}?)<\\/span>`,
    'i',
  );
  const m = html.match(re);
  return m ? stripTags(m[1]) : null;
}

function parseEuro(raw: string | null): number | null {
  if (!raw) return null;
  const s = raw.replace(/[€\s]/g, '').toLowerCase();
  const m = s.match(/([\d.,]+)\s*(m|k|mil|bn)?/);
  if (!m) return null;
  const num = Number(m[1].replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(num)) return null;
  const mult = m[2] === 'm' || m[2] === 'mil' ? 1_000_000 : m[2] === 'k' ? 1_000 : m[2] === 'bn' ? 1_000_000_000 : 1;
  return num * mult;
}

function parseDateDMY(raw: string | null): string | null {
  if (!raw) return null;
  // Accept "DD/MM/YYYY", "DD.MM.YYYY", "Mon DD, YYYY", "DD Mon YYYY"
  const months: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', sept: '09', oct: '10', nov: '11', dec: '12',
  };
  let m = raw.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = raw.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const mon = months[m[1].toLowerCase().slice(0, 4)] || months[m[1].toLowerCase().slice(0, 3)];
    if (mon) return `${m[3]}-${mon}-${m[2].padStart(2, '0')}`;
  }
  m = raw.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (m) {
    const mon = months[m[2].toLowerCase().slice(0, 4)] || months[m[2].toLowerCase().slice(0, 3)];
    if (mon) return `${m[3]}-${mon}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

function parseTmHtml(html: string) {
  const out: Record<string, unknown> = {};

  // og:image is usually the player photo
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (og) out.photo_url = og[1];

  // Position (TM "Position:" label appears multiple times; first detail block is main pos)
  const pos = pickAfterLabel(html, 'Position:');
  if (pos) out.position = pos;

  // DOB + age: "Date of birth/Age:"  e.g. "May 5, 1995 (29)"
  const dobRaw = pickAfterLabel(html, 'Date of birth') || pickAfterLabel(html, 'Born:');
  if (dobRaw) {
    const ageMatch = dobRaw.match(/\((\d{1,3})\)/);
    if (ageMatch) out.age = Number(ageMatch[1]);
    const iso = parseDateDMY(dobRaw.replace(/\(\d+\)/, '').trim());
    if (iso) out.date_of_birth = iso;
  }

  const nat = pickAfterLabel(html, 'Citizenship') || pickAfterLabel(html, 'Nationality');
  if (nat) out.nationality = nat.split(/\s+/).slice(0, 4).join(' ');

  const height = pickAfterLabel(html, 'Height:');
  if (height) out.height = height;

  const foot = pickAfterLabel(html, 'Foot:');
  if (foot) out.foot = foot;

  const club = pickAfterLabel(html, 'Current club:');
  if (club) out.current_club = club;

  const ce = pickAfterLabel(html, 'Contract expires:');
  if (ce) {
    const iso = parseDateDMY(ce);
    if (iso) out.contract_end = iso;
  }

  // Market value: try the headline block first
  const mvBlock = html.match(/data-header[^>]*>[\s\S]{0,500}?(€[\d.,]+\s*(?:m|k|bn)?)/i);
  const mv = mvBlock ? mvBlock[1] : null;
  const mvNum = parseEuro(mv);
  if (mvNum) out.market_value = mvNum;

  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Auth: validated JWT
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ ok: false, reason: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ ok: false, reason: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: { tmUrl?: string } = {};
  try { body = await req.json(); } catch (_) {}
  const tmUrl = (body.tmUrl || '').trim();
  const m = tmUrl.match(TM_URL_RE);
  if (!m) {
    return new Response(JSON.stringify({ ok: false, reason: 'invalid_url' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const r = await fetch(tmUrl, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(8000) });
    if (r.status === 403 || r.status === 429) {
      return new Response(JSON.stringify({ ok: false, reason: 'blocked', status: r.status }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!r.ok) {
      return new Response(JSON.stringify({ ok: false, reason: 'http_error', status: r.status }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const html = await r.text();
    if (html.length < 1000 || /captcha|access denied/i.test(html.slice(0, 4000))) {
      return new Response(JSON.stringify({ ok: false, reason: 'blocked' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const data = parseTmHtml(html);
    return new Response(JSON.stringify({ ok: true, data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const reason = /timeout|aborted/i.test(msg) ? 'timeout' : 'fetch_error';
    return new Response(JSON.stringify({ ok: false, reason, message: msg }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
