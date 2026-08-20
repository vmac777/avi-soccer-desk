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
 * The contract column is the reason that matters. Transfermarkt lists a contract
 * *year*, not a date. Storing "30 June 2027" would invent a precision nobody
 * published — and contract expiry is the field that decides when a player may
 * talk to other clubs. So the year is kept in enrichment_notes as sourced fact,
 * the date is stored as a usable approximation, and the date is marked
 * placeholder so it can never be printed or matched on.
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

/** Minimal CSV reader: no embedded newlines, quotes respected. */
function parseCsv(text) {
  const lines = text.trim().split('\n');
  const header = splitRow(lines[0]);
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
  const contractYear = r.contract_year ? Number(r.contract_year) : null;

  // Only the year is published. The date is an approximation and is marked as
  // such — see the header note.
  const contractEnd = contractYear ? `${contractYear}-06-30` : null;

  const notes = [
    contractYear ? `Transfermarkt lists contract end year ${contractYear}; exact date unconfirmed.` : null,
    r.contract_option ? `Contract option: ${r.contract_option}.` : null,
    'Club not captured — Transfermarkt list showed crests only. Needs confirming.',
  ].filter(Boolean).join(' ');

  const row = {
    name,
    slug: slugify(name),
    position: mark('position', r.position, 'transfermarkt'),
    age: r.age ? Number(mark('age', r.age, 'transfermarkt')) : null,
    nationality: mark('nationality', r.nationality, 'transfermarkt'),
    league: mark('league', r.league, 'transfermarkt'),
    market_value: r.market_value_eur ? Number(mark('marketValue', r.market_value_eur, 'transfermarkt')) : null,
    contract_end: contractEnd,
    priority_ranking: 'Medium',
    enrichment_notes: notes,
    data_provenance: provenance,
  };

  // Deliberately NOT marked: contract_end (year only, date inferred) and
  // current_club (not readable from the source list). Both stay placeholder.
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
const sourced = rows.filter((r) => r.market_value != null).length;
const noContract = rows.filter((r) => r.contract_end == null).length;
console.log(`  with a market value: ${sourced}`);
console.log(`  with no contract year at all: ${noContract}`);
console.log(`  club known: 0 (crests only in the source)`);
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
console.log('Next: confirm each player\'s club, then re-enrich from Transfermarkt to fill DOB, foot, height and photo.');
