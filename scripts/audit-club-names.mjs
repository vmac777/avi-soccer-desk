#!/usr/bin/env node
/**
 * Reconcile the club names on the roster against the clubs table.
 *
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/audit-club-names.mjs
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/audit-club-names.mjs --apply
 *
 * TransferRoom enrichment resolves a player's club by looking `current_club` up
 * in the clubs table to get a tr_team_id. That lookup is an exact string match,
 * so "Atlético Mineiro" on the roster and "Atletico Mineiro" in the clubs table
 * are two different clubs and the player gets club_not_in_clubs_table — even
 * though we hold everything needed to enrich them.
 *
 * The roster names were typed from a Transfermarkt list; the club names came
 * from a different desk's database. There is no reason for them to agree on
 * accents, "FC" prefixes, or Portuguese versus English spellings.
 *
 * Default is read-only: it prints what does not match and what it would rename
 * each to. `--apply` writes the renames it is confident about — those where the
 * two names are identical once accents, punctuation and club-type words are
 * removed. Anything less certain is listed for a human and never written, because
 * quietly filing a player under the wrong club is worse than leaving him
 * unenriched.
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

/** Words that say what kind of club it is, not which club it is. */
const CLUB_WORDS = new Set([
  'fc', 'cf', 'ca', 'sc', 'ec', 'ac', 'afc', 'cd', 'sd', 'ss', 'as', 'rc', 'sv', 'vfl', 'vfb',
  'club', 'clube', 'futebol', 'football', 'futbol', 'atletico', 'atlético',
  'de', 'do', 'da', 'of', 'the',
]);

/**
 * Reduce a club name to the part that identifies it.
 *
 * Accents go because one source has them and the other does not. Club-type
 * words go because "SC Paderborn" and "Paderborn 07" are the same club. Digits
 * stay out for the same reason.
 */
function normalize(name) {
  const base = String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const kept = base.filter((w) => !CLUB_WORDS.has(w) && !/^\d+$/.test(w));
  // Everything was a club word — keep the original tokens rather than nothing.
  return (kept.length ? kept : base).join(' ');
}

/** Cheap similarity for suggestions only — never for an automatic rename. */
function similarity(a, b) {
  const A = new Set(a.split(' '));
  const B = new Set(b.split(' '));
  const shared = [...A].filter((w) => B.has(w)).length;
  return shared / Math.max(A.size, B.size);
}

const supabase = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { error: authErr } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (authErr) { console.error(`Sign-in failed: ${authErr.message}`); process.exit(1); }

const { data: clubs, error: clubErr } = await supabase
  .from('clubs').select('name, league, tr_team_id, tr_competition_id');
if (clubErr) { console.error(`Could not read clubs: ${clubErr.message}`); process.exit(1); }

const { data: players, error: pErr } = await supabase
  .from('scouted_targets').select('id, name, current_club, owner_club, loan_club');
if (pErr) { console.error(`Could not read roster: ${pErr.message}`); process.exit(1); }

const byExact = new Map(clubs.map((c) => [c.name, c]));
const byNormal = new Map();
for (const c of clubs) {
  const k = normalize(c.name);
  // Prefer a club that carries the TransferRoom mapping — that is the whole
  // point of matching, and some names appear twice with only one mapped.
  const held = byNormal.get(k);
  if (!held || (!held.tr_team_id && c.tr_team_id)) byNormal.set(k, c);
}

const COLUMNS = ['current_club', 'owner_club', 'loan_club'];

const matched = [];
const renames = [];   // confident: identical once normalized
const unresolved = new Map();  // name -> best guesses

for (const p of players) {
  for (const col of COLUMNS) {
    const raw = p[col];
    if (!raw) continue;
    if (byExact.has(raw)) { matched.push(raw); continue; }

    const hit = byNormal.get(normalize(raw));
    if (hit) {
      renames.push({ id: p.id, player: p.name, column: col, from: raw, to: hit.name, mapped: !!hit.tr_team_id });
      continue;
    }

    if (!unresolved.has(raw)) {
      const n = normalize(raw);
      const guesses = clubs
        .map((c) => ({ name: c.name, score: similarity(n, normalize(c.name)), mapped: !!c.tr_team_id }))
        .filter((g) => g.score >= 0.5)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      unresolved.set(raw, { guesses, players: [] });
    }
    unresolved.get(raw).players.push(`${p.name} (${col})`);
  }
}

console.log(`${clubs.length} clubs, ${players.length} players\n`);
console.log(`  exact match:     ${matched.length}`);
console.log(`  same club, different spelling: ${renames.length}`);
console.log(`  no match at all: ${[...unresolved.values()].reduce((n, u) => n + u.players.length, 0)} across ${unresolved.size} names\n`);

if (renames.length) {
  console.log('Renames — identical once accents and club words are removed:\n');
  const grouped = new Map();
  for (const r of renames) {
    const k = `${r.from} -> ${r.to}`;
    if (!grouped.has(k)) grouped.set(k, { ...r, count: 0 });
    grouped.get(k).count++;
  }
  for (const g of grouped.values()) {
    console.log(`  ${g.from}  ->  ${g.to}   (${g.count} ${g.count === 1 ? 'player' : 'players'})${g.mapped ? '' : '  [club has no TR mapping]'}`);
  }
  console.log('');
}

if (unresolved.size) {
  console.log('No match — these need a human. Nothing is written for them:\n');
  for (const [name, u] of unresolved) {
    console.log(`  ${name}   (${u.players.slice(0, 3).join(', ')}${u.players.length > 3 ? `, +${u.players.length - 3} more` : ''})`);
    if (u.guesses.length) {
      for (const g of u.guesses) {
        console.log(`      did you mean: ${g.name}${g.mapped ? '' : '  [no TR mapping]'}`);
      }
    } else {
      console.log('      nothing close in the clubs table — the club may need adding');
    }
  }
  console.log('');
}

if (!apply) {
  if (renames.length) console.log('Read-only. Re-run with --apply to write the renames above.');
  process.exit(0);
}

if (!renames.length) { console.log('Nothing to apply.'); process.exit(0); }

let ok = 0;
const fails = [];
for (const r of renames) {
  const { error } = await supabase
    .from('scouted_targets').update({ [r.column]: r.to }).eq('id', r.id);
  if (error) fails.push({ who: `${r.player} ${r.column}`, error: error.message });
  else ok++;
  await new Promise((res) => setTimeout(res, 40));
}

console.log(`\napplied ${ok}/${renames.length}`);
fails.slice(0, 10).forEach((f) => console.error(`  !! ${f.who}: ${f.error}`));
if (fails.length) process.exit(1);
console.log('Re-run enrichment from the roster to pick up the newly resolvable clubs.');
