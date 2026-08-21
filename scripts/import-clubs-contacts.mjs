#!/usr/bin/env node
/**
 * Bring the club/league structure and the contact directory across from a
 * backup of another desk, deliberately leaving that desk's CRM layer behind.
 *
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... \
 *     node scripts/import-clubs-contacts.mjs backups/<timestamp> [--dry-run]
 *
 * Produce the backup with scripts/export-backup.mjs run against the source
 * project. This script only ever reads those JSON files.
 *
 * WHAT COMES ACROSS
 *
 *   clubs     name, country, league, tier — public reference data, and what
 *             the Country -> League -> Club pickers are built on.
 *
 *   contacts  market, club, contact_person, role — who holds which job at
 *             which club. Names and titles only.
 *
 * WHAT DOES NOT, AND WHY
 *
 * The source rows also carry who_spoke, last_contact, stage, needs,
 * club_interest and players_offered. That is not a directory, it is one
 * organisation's private read on each relationship: how warm it is, who owns
 * it, what that club is hunting for, and which of their players it has bitten
 * on. In transfer terms the two desks are counterparties, so that layer stays
 * where it was built.
 *
 * Direct phone numbers are also left behind. A mobile number is something an
 * identifiable person handed to that desk, not consent to be called from this
 * one. LinkedIn URLs do come across: a public professional profile is the same
 * thing a search for that person's name would return.
 *
 * Those fields are written as the schema's neutral values rather than copied.
 * `stage` becomes '' — no relationship yet — rather than the column default of
 * 'Contacted - No Answer', which would assert an approach that never happened.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const backupDir = args.find((a) => !a.startsWith('--'));

if (!backupDir) {
  console.error('Usage: node scripts/import-clubs-contacts.mjs <backups/dir> [--dry-run]');
  process.exit(1);
}

const clubsPath = join(backupDir, 'tables', 'clubs.json');
const contactsPath = join(backupDir, 'tables', 'contacts.json');
for (const p of [clubsPath, contactsPath]) {
  if (!existsSync(p)) { console.error(`Not found: ${p}`); process.exit(1); }
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

if (!dryRun && (!URL || !KEY || !EMAIL || !PASSWORD)) {
  console.error('Need SUPABASE_URL/KEY (or .env) plus ADMIN_EMAIL and ADMIN_PASSWORD.');
  process.exit(1);
}

const clubs = JSON.parse(readFileSync(clubsPath, 'utf8'));
const contacts = JSON.parse(readFileSync(contactsPath, 'utf8'));

/**
 * Reference data: carried over as-is.
 *
 * tr_team_id and tr_competition_id come too. They are public TransferRoom
 * identifiers, not anyone's private information, and without them TransferRoom
 * enrichment cannot run at all: it resolves a player's club through this table
 * and gives up with club_not_mapped_to_tr when the mapping is absent.
 */
const clubRows = clubs.map((c) => ({
  name: c.name,
  country: c.country ?? null,
  league: c.league ?? null,
  tier: c.tier ?? null,
  tr_team_id: c.tr_team_id ?? null,
  tr_competition_id: c.tr_competition_id ?? null,
}));

/** The directory half only. Everything else is reset, not copied. */
const DROPPED = [
  // one desk's private read on the relationship
  'who_spoke', 'last_contact', 'stage', 'needs', 'club_interest', 'players_offered', 'priority',
  // direct lines, given to that desk and not to this one
  'phone1', 'phone2', 'phone3',
];

/**
 * Trimmed, because contact_person is half the key this script dedupes on. A
 * trailing space makes "Murad " and "Murad" two different people, so a second
 * run would insert the whole directory again.
 */
const clean = (v) => (typeof v === 'string' ? v.trim() : '');

const contactRows = contacts.map((c) => ({
  market: clean(c.market),
  club: clean(c.club),
  contact_person: clean(c.contact_person),
  role: clean(c.role),
  is_primary: false,

  // A LinkedIn URL is a public professional profile — the same thing a search
  // would return. It travels; a direct line does not.
  linkedin: clean(c.linkedin),

  // Left behind deliberately — see the header.
  phone1: '',
  phone2: '',
  phone3: '',

  // Deliberately reset — see the header.
  who_spoke: '',
  last_contact: null,
  stage: '',
  needs: '',
  club_interest: '',
  players_offered: '',
  priority: 'Normal',
}));

// A row with no name is not a directory entry — it is a club with a gap where
// a person should be. Those carry nothing this import is for.
const nameless = contactRows.filter((c) => !c.contact_person).length;
const namedContacts = contactRows.filter((c) => c.contact_person);

const sourcePhones = contacts.filter((c) => c.phone1 || c.phone2 || c.phone3).length;
const carriedLinkedin = namedContacts.filter((c) => c.linkedin).length;
const carriedNonEmpty = contacts.filter((c) => DROPPED.some((f) => c[f])).length;

console.log(`from ${backupDir}`);
console.log(`  clubs:    ${clubRows.length}`);
console.log(`  contacts: ${namedContacts.length}  (names, roles, LinkedIn)`);
if (nameless > 0) console.log(`            ${nameless} rows have no name and are skipped`);
console.log(`  leagues:  ${new Set(clubRows.map((c) => c.league).filter(Boolean)).size}`);
console.log(`  TR-mapped: ${clubRows.filter((c) => c.tr_team_id && c.tr_competition_id).length}  (needed for TransferRoom enrichment)`);
console.log(`\n  leaving behind, from ${carriedNonEmpty} rows that carried something:`);
console.log(`    ${DROPPED.join(', ')}`);
console.log(`    ${sourcePhones} phone numbers are NOT copied`);
console.log(`  carrying ${carriedLinkedin} LinkedIn URLs`);

if (dryRun) {
  console.log('\n--dry-run: first club and contact as they would be written\n');
  console.log(JSON.stringify(clubRows[0], null, 2));
  console.log(JSON.stringify(namedContacts[0], null, 2));
  process.exit(0);
}

const supabase = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { error: authErr } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (authErr) { console.error(`Sign-in failed: ${authErr.message}`); process.exit(1); }

// --- clubs: unique on name, so upsert is idempotent ---
let clubsOk = 0;
const clubFails = [];
for (const row of clubRows) {
  const { error } = await supabase.from('clubs').upsert(row, { onConflict: 'name' });
  if (error) clubFails.push({ name: row.name, error: error.message }); else clubsOk++;
  await new Promise((r) => setTimeout(r, 40));
}
console.log(`\nclubs: ${clubsOk}/${clubRows.length}`);
clubFails.slice(0, 5).forEach((f) => console.error(`  !! ${f.name}: ${f.error}`));

// --- contacts: no natural key, so skip anything already present rather than
//     duplicating the directory on a second run ---
const { data: existing, error: readErr } = await supabase
  .from('contacts').select('club, contact_person');
if (readErr) { console.error(`Could not read existing contacts: ${readErr.message}`); process.exit(1); }

const seen = new Set((existing ?? []).map((c) => `${c.club}::${c.contact_person}`));
const fresh = namedContacts.filter((c) => !seen.has(`${c.club}::${c.contact_person}`));
console.log(`contacts: ${fresh.length} new, ${namedContacts.length - fresh.length} already present`);

let contactsOk = 0;
const contactFails = [];
for (const row of fresh) {
  const { error } = await supabase.from('contacts').insert(row);
  if (error) contactFails.push({ who: `${row.club} / ${row.contact_person}`, error: error.message });
  else contactsOk++;
  await new Promise((r) => setTimeout(r, 40));
}
console.log(`contacts: ${contactsOk}/${fresh.length} inserted`);
contactFails.slice(0, 10).forEach((f) => console.error(`  !! ${f.who}: ${f.error}`));

if (clubFails.length || contactFails.length) process.exit(1);
console.log('\nNames, roles and LinkedIn URLs imported. Relationship history and phone');
console.log('numbers were not copied — those start empty here.');
