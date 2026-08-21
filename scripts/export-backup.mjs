#!/usr/bin/env node
/**
 * Self-serve backup for a Lovable Cloud project.
 *
 * Lovable Cloud does not expose the database password or the service-role key,
 * so `pg_dump` and a direct Postgres connection are unavailable. This pulls
 * everything reachable over the public API instead, authenticated as an admin
 * user, and writes it to a timestamped directory.
 *
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... node scripts/export-backup.mjs
 *
 * SUPABASE_URL and SUPABASE_ANON_KEY default to the VITE_* values in .env.
 *
 * What this CANNOT export — see MANIFEST.json in the output:
 *   - auth.users. Accounts and password hashes are not reachable over the API,
 *     so a restore into a new project means re-inviting every user.
 *   - Rows an admin's RLS policies do not select.
 *   - Vault secrets and edge-function secrets.
 *   - pg_cron schedules (they live in the repo's migrations).
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TABLES = [
  'buy_negotiation_entries', 'buy_pitch_documents', 'buy_pitch_notes', 'buy_pitches',
  'club_briefs', 'club_sources', 'clubs', 'contacts', 'email_failures',
  'follow_up_links', 'follow_ups', 'interactions', 'market_briefs', 'news_items',
  'news_items_audit', 'news_items_clubs', 'news_reads', 'pitch_documents',
  'pitch_notes', 'pitches', 'player_club_links', 'player_notes',
  'player_recommendations', 'players_tracking', 'profiles', 'scouted_targets',
  'settings', 'squad_player_xtv_history', 'submission_rate_limits',
  'tr_competition_players_cache', 'tr_competition_players_history',
  'tr_competition_transfers_cache', 'tr_player_details_cache', 'tr_proxy_log',
  'tr_recon_unmatched',
];

const BUCKETS = ['pitch-documents', 'pitch-attachments', 'shared-briefs'];

/**
 * Paging is deliberately conservative. An early version of this script read
 * 1000 rows at a time from tr_competition_players_history, whose rows hold
 * whole-competition jsonb snapshots. The query outlived its HTTP request,
 * kept holding connections, and took the production database down until the
 * backend was restarted.
 *
 * Defaults now: small pages, a pause between requests, a hard per-request
 * timeout so no query can outlive its caller, and the heavy tr_* tables
 * excluded unless explicitly asked for.
 */
const PAGE = 200;
const MIN_PAGE = 5;
const MAX_RETRIES = 4;
const REQUEST_TIMEOUT_MS = 20_000;
const THROTTLE_MS = 150;

// Rows carry large jsonb payloads — read these in very small pages.
const PAGE_OVERRIDES = {
  tr_competition_players_history: 5,
  tr_competition_players_cache: 5,
  tr_competition_transfers_cache: 5,
  tr_player_details_cache: 25,
  tr_proxy_log: 50,
};

/**
 * Skipped unless --include-tr is passed. Four of these are caches
 * rebuildable from TransferRoom. tr_competition_players_history is real
 * history and worth capturing — but it is also the table that caused the
 * outage, so ask Lovable for a CSV of it rather than reading it here.
 */
const TR_TABLES = Object.keys(PAGE_OVERRIDES);

const pageSizeFor = (name) => PAGE_OVERRIDES[name] ?? PAGE;

function envFromDotenv(key) {
  try {
    const m = readFileSync('.env', 'utf8').match(new RegExp(`^${key}="?([^"\\n]+)"?`, 'm'));
    return m?.[1];
  } catch { return undefined; }
}

const URL = process.env.SUPABASE_URL || envFromDotenv('VITE_SUPABASE_URL');
const KEY = process.env.SUPABASE_ANON_KEY || envFromDotenv('VITE_SUPABASE_PUBLISHABLE_KEY');
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;

if (!URL || !KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_ANON_KEY (and no .env fallback).');
  process.exit(1);
}
if (!EMAIL || !PASSWORD) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD to an admin account.');
  process.exit(1);
}

const supabase = createClient(URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const onlyArg = process.argv.find((a) => a.startsWith('--tables='));
const only = onlyArg ? onlyArg.slice('--tables='.length).split(',').map((s) => s.trim()) : null;
const skipStorage = process.argv.includes('--skip-storage');
const includeTr = process.argv.includes('--include-tr');
const defaultTables = TABLES.filter((n) => includeTr || !TR_TABLES.includes(n));
if (only) {
  const unknown = only.filter((n) => !TABLES.includes(n));
  if (unknown.length) { console.error(`Unknown table(s): ${unknown.join(', ')}`); process.exit(1); }
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = join('backups', stamp);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Export one table, adapting the page size downwards when the gateway times
 * out. Tables holding large jsonb payloads (the tr_* snapshot tables) cannot
 * serve 1000 rows inside the gateway's timeout, but serve happily in smaller
 * pages. Whatever was read is always written, so a table that fails partway
 * still yields a partial file rather than nothing.
 */
async function exportTable(name) {
  const rows = [];
  let size = pageSizeFor(name);
  let from = 0;
  let attempts = 0;

  for (;;) {
    // A hard per-request timeout means a slow query is abandoned client-side
    // instead of being left to run on the server holding a connection.
    const { data, error } = await supabase
      .from(name)
      .select('*')
      .range(from, from + size - 1)
      .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS));

    if (error) {
      // Shrink the page and retry — most failures here are payload-size
      // timeouts rather than genuine errors.
      if (size > MIN_PAGE) {
        size = Math.max(MIN_PAGE, Math.floor(size / 4));
        continue;
      }
      // Already at the smallest page: treat as transient and back off a few
      // times before giving up on the rest of the table.
      if (++attempts <= MAX_RETRIES) {
        await sleep(1000 * attempts);
        continue;
      }
      writeFileSync(join(outDir, 'tables', `${name}.json`), JSON.stringify(rows, null, 2));
      return { name, error: error.message, rows: rows.length, partial: true };
    }

    attempts = 0;
    rows.push(...data);
    if (data.length < size) break;
    from += data.length;
    await sleep(THROTTLE_MS);   // leave the database room to breathe
  }

  writeFileSync(join(outDir, 'tables', `${name}.json`), JSON.stringify(rows, null, 2));
  return { name, rows: rows.length, ...(size < pageSizeFor(name) ? { pageSize: size } : {}) };
}

async function exportBucket(bucket) {
  const files = [];
  const walk = async (prefix) => {
    // list() caps at 1000 entries per call, so page through with offset —
    // otherwise a folder with more files truncates while still reporting success.
    const entries = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(prefix, { limit: PAGE, offset });
      if (error) throw new Error(error.message);
      entries.push(...data);
      if (data.length < PAGE) break;
    }
    for (const entry of entries) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) { await walk(path); continue; }   // folder
      const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(path);
      if (dlErr) { files.push({ path, error: dlErr.message }); continue; }
      const dest = join(outDir, 'storage', bucket, path);
      mkdirSync(join(dest, '..'), { recursive: true });
      writeFileSync(dest, Buffer.from(await blob.arrayBuffer()));
      files.push({ path, bytes: blob.size });
    }
  };
  try { await walk(''); } catch (e) { return { bucket, error: e.message, files }; }
  return { bucket, files };
}

const { error: authErr } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (authErr) { console.error(`Sign-in failed: ${authErr.message}`); process.exit(1); }

mkdirSync(join(outDir, 'tables'), { recursive: true });
mkdirSync(join(outDir, 'storage'), { recursive: true });
console.log(`Exporting to ${outDir}\n`);
const skipped = only ? [] : TABLES.filter((n) => !defaultTables.includes(n));
if (skipped.length) {
  console.log(`Skipping ${skipped.length} heavy TransferRoom table(s): ${skipped.join(', ')}`);
  console.log('These hold large jsonb payloads. Pass --include-tr to read them anyway.\n');
}

const tableResults = [];
for (const t of (only || defaultTables)) {
  const r = await exportTable(t);
  tableResults.push(r);
  if (r.error) console.log(`  !! ${t}: ${r.rows} rows kept, then failed: ${r.error}`);
  else console.log(`  ${t}: ${r.rows} rows${r.pageSize ? ` (paged at ${r.pageSize})` : ''}`);
}

console.log('');
const bucketResults = [];
for (const b of (skipStorage || only ? [] : BUCKETS)) {
  const r = await exportBucket(b);
  bucketResults.push(r);
  const ok = r.files.filter((f) => !f.error).length;
  console.log(r.error ? `  !! ${b}: ${r.error}` : `  ${b}: ${ok} files`);
}

const failed = tableResults.filter((r) => r.error);
writeFileSync(join(outDir, 'MANIFEST.json'), JSON.stringify({
  exportedAt: new Date().toISOString(),
  project: URL,
  exportedBy: EMAIL,
  tables: tableResults,
  skippedTables: skipped.length
    ? { tables: skipped, reason: 'Heavy jsonb tables, excluded by default. Re-run with --include-tr, or ask Lovable for a CSV of tr_competition_players_history (the only one that is not a rebuildable cache).' }
    : undefined,
  storage: bucketResults,
  notExported: [
    'auth.users — not reachable over the API. A restore requires re-inviting every user.',
    'Rows excluded by the exporting admin\'s RLS policies.',
    'Vault secrets and edge-function secrets.',
    'pg_cron schedules — these live in supabase/migrations/.',
  ],
}, null, 2));

const totalRows = tableResults.reduce((n, r) => n + (r.rows || 0), 0);
const totalFiles = bucketResults.reduce((n, r) => n + r.files.filter((f) => !f.error).length, 0);
console.log(`\n${totalRows} rows, ${totalFiles} files -> ${outDir}`);
if (failed.length) {
  console.log(`\n${failed.length} table(s) failed: ${failed.map((f) => f.name).join(', ')}`);
  process.exit(1);
}
