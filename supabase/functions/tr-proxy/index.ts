// Thin pass-through proxy to the TransferRoom API.
// Auth model:
//   - Caller -> Proxy: static bearer token (TR_PROXY_BEARER_TOKEN), constant-time compared.
//   - Proxy -> TR:    email/password login, bearer token cached in module memory ~50min.
// Logs every call to the tr_proxy_log table (shape only — no bodies).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TR_BASE = 'https://apiprod.transferroom.com/api/external';

const ROUTES: Record<string, string> = {
  'competitions': '/competitions',
  'players': '/players',
  'transfers': '/transfers',
  'pitches': '/pitches',
  'injuries-player': '/injuries/players',
  'injuries-competition': '/injuries/competitions',
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

let cachedTrToken: { value: string; expiresAt: number } | null = null;

async function getTrToken(): Promise<string> {
  if (cachedTrToken && cachedTrToken.expiresAt > Date.now()) {
    return cachedTrToken.value;
  }

  const email = Deno.env.get('TR_API_EMAIL');
  const password = Deno.env.get('TR_API_PASSWORD');
  if (!email || !password) {
    throw new Error('TR credentials not configured');
  }

  const loginUrl = `${TR_BASE}/login?email=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`;
  const r = await fetch(loginUrl, { method: 'POST' });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`TR login failed: ${r.status} ${text.slice(0, 200)}`);
  }

  // TR may return either a raw string token or an object with token/Token field.
  const contentType = r.headers.get('content-type') || '';
  let token: string | undefined;
  if (contentType.includes('application/json')) {
    const body = await r.json();
    if (typeof body === 'string') {
      token = body;
    } else if (body && typeof body === 'object') {
      token = body.token || body.Token || body.access_token;
    }
  } else {
    const text = (await r.text()).trim();
    // Strip surrounding quotes if present.
    token = text.replace(/^"|"$/g, '');
  }

  if (!token) {
    throw new Error('TR login response missing token');
  }

  cachedTrToken = {
    value: token,
    expiresAt: Date.now() + 50 * 60 * 1000,
  };
  return token;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  // ── 1. Auth: caller bearer token ────────────────────────────
  const authHeader = req.headers.get('Authorization') || '';
  const callerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
  const expectedToken = Deno.env.get('TR_PROXY_BEARER_TOKEN') || '';

  if (!callerToken || !expectedToken || !constantTimeEqual(callerToken, expectedToken)) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  }

  // ── 2. Parse route ──────────────────────────────────────────
  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  const route = segments[segments.length - 1];

  if (!route || !ROUTES[route]) {
    return new Response(
      JSON.stringify({ error: 'unknown_route', available: Object.keys(ROUTES) }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // ── 3. Get TR token ─────────────────────────────────────────
  let trToken: string;
  try {
    trToken = await getTrToken();
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'tr_auth_failed', message: String(err) }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // ── 4. Forward to TR ────────────────────────────────────────
  const trUrl = `${TR_BASE}${ROUTES[route]}${url.search}`;
  let trRes: Response;
  let responseBody: string;
  try {
    trRes = await fetch(trUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${trToken}` },
    });
    responseBody = await trRes.text();

    // If TR rejects our cached token, clear it and retry once.
    if (trRes.status === 401 || trRes.status === 403) {
      cachedTrToken = null;
      try {
        const fresh = await getTrToken();
        trRes = await fetch(trUrl, {
          method: 'GET',
          headers: { Authorization: `Bearer ${fresh}` },
        });
        responseBody = await trRes.text();
      } catch (_e) {
        // fall through with original 401/403
      }
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'tr_request_failed', message: String(err) }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // ── 5. Log (fire-and-forget) ────────────────────────────────
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    supabase
      .from('tr_proxy_log')
      .insert({
        route,
        query_string: url.search || null,
        status_code: trRes.status,
        duration_ms: Date.now() - startTime,
        response_size_bytes: responseBody.length,
      })
      .then(() => {});
  } catch (_e) {
    // never block on logging
  }

  // ── 6. Return TR response verbatim ──────────────────────────
  return new Response(responseBody, {
    status: trRes.status,
    headers: {
      ...corsHeaders,
      'Content-Type': trRes.headers.get('Content-Type') || 'application/json',
    },
  });
});
