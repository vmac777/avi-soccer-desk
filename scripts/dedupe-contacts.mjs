#!/usr/bin/env node
/**
 * Remove contacts imported twice.
 *
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/dedupe-contacts.mjs
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/dedupe-contacts.mjs --apply
 *
 * How they got there: an early import run wrote names exactly as the source held
 * them, trailing spaces and all. The importer skips contacts it already has by
 * matching on club + contact_person, so once trimming was added the key changed
 * — "Joaquim Pinto " and "Joaquim Pinto" stopped matching, and a later run
 * inserted the same people a second time.
 *
 * Groups by club and trimmed, case-folded name, and keeps one row per person.
 * Which one is not arbitrary: a row carrying a LinkedIn URL or any relationship
 * detail outranks an empty one, so nothing anybody typed is thrown away for the
 * sake of tidiness. The survivor's name and role are rewritten trimmed, so a
 * future import matches it and this cannot recur.
 *
 * Read-only by default. This deletes rows, so look at the report first.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const apply = process.argv.includes('--apply');

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

if (!URL || !KEY || !EMAIL || !PASSWORD) {
  console.error('Need SUPABASE_URL/KEY (or .env) plus ADMIN_EMAIL and ADMIN_PASSWORD.');
  process.exit(1);
}

const supabase = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { error: authErr } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (authErr) { console.error(`Sign-in failed: ${authErr.message}`); process.exit(1); }

/** PostgREST caps a response; page through so a big directory is not truncated. */
async function readAll() {
  const rows = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from('contacts')
      .select('id, market, club, contact_person, role, linkedin, phone1, phone2, phone3, who_spoke, last_contact, stage, needs, club_interest, players_offered, is_primary, created_at')
      .order('created_at', { ascending: true })
      .range(from, from + page - 1);
    if (error) { console.error(`Could not read contacts: ${error.message}`); process.exit(1); }
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < page) break;
  }
  return rows;
}

const contacts = await readAll();
const key = (c) => `${c.market}::${c.club}::${String(c.contact_person ?? '').trim().toLowerCase()}`;

/**
 * How much a row is worth keeping. Anything somebody entered by hand beats an
 * empty duplicate, so a merge never silently drops a phone number or a note.
 */
const FILLED = ['linkedin', 'phone1', 'phone2', 'phone3', 'who_spoke', 'last_contact', 'stage', 'needs', 'club_interest', 'players_offered'];
const weight = (c) => FILLED.reduce((n, f) => n + (c[f] ? 1 : 0), 0) + (c.is_primary ? 1 : 0);

const groups = new Map();
for (const c of contacts) {
  if (!String(c.contact_person ?? '').trim()) continue;   // nameless rows are a separate question
  const k = key(c);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(c);
}

const dupes = [...groups.values()].filter((g) => g.length > 1);
const doomed = [];
const retrims = [];

for (const g of dupes) {
  // Richest row wins; oldest breaks a tie so the original survives.
  const sorted = [...g].sort((a, b) =>
    weight(b) - weight(a) || String(a.created_at).localeCompare(String(b.created_at)));
  const [keep, ...rest] = sorted;

  // If a loser holds something the winner does not, say so rather than deleting.
  const conflicts = rest.filter((r) => FILLED.some((f) => r[f] && !keep[f]));
  if (conflicts.length) {
    console.warn(`  !! ${keep.club} / ${keep.contact_person}: a duplicate holds data the kept row does not — skipped`);
    continue;
  }

  doomed.push(...rest);
  const trimmedName = String(keep.contact_person).trim();
  const trimmedRole = String(keep.role ?? '').trim();
  if (trimmedName !== keep.contact_person || trimmedRole !== (keep.role ?? '')) {
    retrims.push({ id: keep.id, contact_person: trimmedName, role: trimmedRole });
  }
}

console.log(`${contacts.length} contacts, ${groups.size} distinct people`);
console.log(`  duplicated:  ${dupes.length} people`);
console.log(`  to delete:   ${doomed.length} rows`);
console.log(`  to re-trim:  ${retrims.length} surviving rows\n`);

if (dupes.length) {
  console.log('First few:\n');
  for (const g of dupes.slice(0, 8)) {
    console.log(`  ${g[0].club} / "${g[0].contact_person}" — ${g.length} rows`);
  }
  console.log('');
}

if (!apply) {
  if (doomed.length) console.log('Read-only. Re-run with --apply to delete the extras.');
  else console.log('Nothing to do.');
  process.exit(0);
}

if (!doomed.length) { console.log('Nothing to do.'); process.exit(0); }

let deleted = 0;
for (const row of doomed) {
  const { error } = await supabase.from('contacts').delete().eq('id', row.id);
  if (error) console.error(`  !! ${row.club} / ${row.contact_person}: ${error.message}`);
  else deleted++;
  await new Promise((r) => setTimeout(r, 30));
}

let trimmed = 0;
for (const row of retrims) {
  const { error } = await supabase
    .from('contacts')
    .update({ contact_person: row.contact_person, role: row.role })
    .eq('id', row.id);
  if (error) console.error(`  !! retrim ${row.contact_person}: ${error.message}`);
  else trimmed++;
  await new Promise((r) => setTimeout(r, 30));
}

console.log(`\ndeleted ${deleted}/${doomed.length}, re-trimmed ${trimmed}/${retrims.length}`);
console.log('Names are stored trimmed now, so a future import matches them.');
