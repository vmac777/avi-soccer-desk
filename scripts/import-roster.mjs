#!/usr/bin/env node
/**
 * Load a roster batch from CSV into `scouted_targets`.
 *
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... \
 *     node scripts/import-roster.mjs data/roster-batch-1.csv [--dry-run]
 *
 * SUPABASE_URL and SUPABASE_ANON_KEY default to the VITE_* values in .env.
 *
 * Every field carries provenance. What Transfermarkt actually published is
 * marked `transfermarkt`; anything inferred or absent stays `placeholder`, which
 * means the UI badges it, PDFs omit it, and matching ignores it.
 *
 * Contract dates here came back confirmed by the agency, so they are marked
 * `verified` rather than placeholder. Anything still blank stays placeholder,
 * which means the UI badges it, PDFs omit it, and matching ignores it.
 *
 * Loans carry two contracts: `contract_end` is the registration holder's, and
 * `loan_contract_end` is when the player returns. `current_club` is who they
 * actually play for today; `owner_club` holds the registration.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const csvPath = args.find((a) => !a.startsWith('--'));

if (!csvPath) {
  console.error('Usage: node scripts/import-roster.mjs <file.csv> [--dry-run]');
  process.exit(1);
}

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

if (!dryRun && (!URL || !KEY)) {
  console.error('Missing SUPABASE_URL / SUPABASE_ANON_KEY (and no .env fallback).');
  process.exit(1);
}
if (!dryRun && (!EMAIL || !PASSWORD)) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD, or pass --dry-run.');
  process.exit(1);
}

/**
 * Minimal CSV reader: no embedded newlines, quotes respected.
 *
 * Header names are trimmed as well as values. A CSV saved by Excel — or by
 * Python's csv module, which defaults to CRLF — leaves a trailing \r on the
 * last header, so `row.last_column` silently reads undefined and one whole
 * column disappears without an error.
 */
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = splitRow(lines[0]).map((h) => h.trim());
  return lines.slice(1).filter((l) => l.trim()).map((line) => {
    const cells = splitRow(line);
    return Object.fromEntries(header.map((h, i) => [h, (cells[i] ?? '').trim()]));
  });
}

function splitRow(line) {
  const out = [];
  let cur = '', quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const slugify = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function toRow(r) {
  const provenance = {};
  const mark = (field, value, source) => {
    if (value !== undefined && value !== null && value !== '') provenance[field] = source;
    return value === '' ? null : value;
  };

  const name = r.name;
  const onLoan = r.tenure === 'loan';

  // The club the player actually turns out for. On loan that is the loan club;
  // the registration holder goes in owner_club.
  const currentClub = (onLoan ? r.loan_club : r.owner_club) || null;
  const currentLeague = (onLoan ? r.loan_league : r.owner_league) || null;

  const notes = [
    r.contract_option ? `Contract option: ${r.contract_option}.` : null,
    onLoan ? `On loan from ${r.owner_club} to ${r.loan_club}.` : null,
    r.tenure === 'free_agent' ? 'Free agent — no club.' : null,
  ].filter(Boolean).join(' ') || null;

  const row = {
    name,
    slug: slugify(name),
    tenure: r.tenure || null,
    // `league` and `current_club` are NOT NULL DEFAULT '' in the inherited
    // schema — this codebase uses empty string, not null, for "unknown". A free
    // agent has neither, and `tenure = 'free_agent'` is what carries that
    // meaning; writing null here just violates the constraint.
    current_club: mark('currentClub', currentClub, 'verified') ?? '',
    league: mark('league', currentLeague, 'verified') ?? '',
    owner_club: mark('ownerClub', r.owner_club || null, 'verified'),
    owner_league: r.owner_league || null,
    loan_club: mark('loanClub', r.loan_club || null, 'verified'),
    loan_league: r.loan_league || null,
    contract_end: mark('contractEndDate', r.contract_end || null, 'verified'),
    loan_contract_end: mark('loanContractEnd', r.loan_contract_end || null, 'verified'),
    position: mark('position', r.position, 'transfermarkt'),
    age: r.age ? Number(mark('age', r.age, 'transfermarkt')) : null,
    nationality: mark('nationality', r.nationality, 'transfermarkt'),
    market_value: r.market_value_eur
      ? Number(mark('marketValue', r.market_value_eur, 'transfermarkt')) : null,
    tm_link: mark('tmLink', r.tm_link || null, 'verified'),
    priority_ranking: 'Medium',
    enrichment_notes: notes,
    data_provenance: provenance,
  };

  return row;
}

const rows = parseCsv(readFileSync(csvPath, 'utf8')).map(toRow);

// Slug collisions are silent data loss on upsert — two different people
// becoming one row. Catch them before touching the database.
const bySlug = new Map();
const collisions = [];
for (const r of rows) {
  if (bySlug.has(r.slug)) collisions.push(r.slug);
  bySlug.set(r.slug, r);
}

console.log(`${rows.length} players parsed from ${csvPath}`);
const counts = (pred) => rows.filter(pred).length;
console.log(`  club known:            ${counts((r) => r.current_club)}`);
console.log(`  contract end known:    ${counts((r) => r.contract_end)}`);
console.log(`  on loan:               ${counts((r) => r.tenure === 'loan')}`);
console.log(`  with a Transfermarkt link (enrichable): ${counts((r) => r.tm_link)}`);
if (collisions.length) {
  console.error(`\n!! slug collisions, would overwrite each other: ${collisions.join(', ')}`);
  process.exit(1);
}

if (dryRun) {
  console.log('\n--dry-run: first row as it would be written\n');
  console.log(JSON.stringify(rows[0], null, 2));
  process.exit(0);
}

const supabase = createClient(URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { error: authErr } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (authErr) { console.error(`Sign-in failed: ${authErr.message}`); process.exit(1); }

let ok = 0;
const failed = [];
for (const row of rows) {
  const { error } = await supabase.from('scouted_targets').upsert(row, { onConflict: 'slug' });
  if (error) failed.push({ name: row.name, error: error.message });
  else ok++;
  await new Promise((r) => setTimeout(r, 80));   // stay gentle on the database
}

console.log(`\nimported ${ok}/${rows.length}`);
if (failed.length) {
  failed.forEach((f) => console.error(`  !! ${f.name}: ${f.error}`));
  process.exit(1);
}
console.log('Next: run enrichment from tm_link to fill DOB, foot, height and photo.');
