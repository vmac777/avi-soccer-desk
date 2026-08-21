#!/usr/bin/env node
/**
 * Give clubs their TransferRoom identifiers, so players at them can be enriched.
 *
 *   TR_PROXY_BEARER_TOKEN=... ADMIN_EMAIL=... ADMIN_PASSWORD=... \
 *     node scripts/resolve-club-tr-ids.mjs                      # report only
 *     node scripts/resolve-club-tr-ids.mjs --apply               # write them
 *     node scripts/resolve-club-tr-ids.mjs --list-competitions   # dump the TR list
 *     node scripts/resolve-club-tr-ids.mjs --list-teams --competition=1526
 *     node scripts/resolve-club-tr-ids.mjs --only="X" --competition=1 --team=2 --rename --apply
 *     node scripts/resolve-club-tr-ids.mjs --only="Shakhtar"     # one club
 *
 * TransferRoom enrichment needs a club's tr_team_id and tr_competition_id. Ours
 * came across with the imported directory, so any club that directory did not
 * contain — Shakhtar, Almería, PAFOS, the rest — has none, and every player at
 * one is unenrichable no matter how the name is spelled.
 *
 * There is no "look up a team" endpoint. The API is organised by competition:
 * ask for a competition's players and each row carries its team's id and name.
 * So this finds the competition, reads it once, and pulls the distinct teams out
 * of it.
 *
 * Reads go through tr-proxy, and each competition's players are cached in
 * tr_competition_players_cache for 24h — the same cache enrichment uses, so a
 * run here makes the next enrichment cheaper rather than more expensive.
 *
 * Read-only by default. `--apply` writes only exact name matches within a
 * competition; anything else is printed for a human. A wrong tr_team_id is
 * worse than none: it silently attaches another squad's valuations to a player.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const listCompetitions = args.includes('--list-competitions');
const listTeams = args.includes('--list-teams');
const rename = args.includes('--rename');
const onlyArg = args.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.slice('--only='.length).toLowerCase() : null;

/**
 * Manual overrides, for when the league recorded on the roster does not lead to
 * the right competition.
 *
 *   --only="PAFOS" --competition=1234            scan that competition only
 *   --only="Botafogo FR" --competition=545 --team=7400 --apply
 *
 * The second form writes a mapping outright. It exists because the automatic
 * pass only accepts an exact team-name match, and the registered name is often
 * not what anyone calls the club — "Botafogo de Futebol e Regatas" is never
 * going to string-match "Botafogo FR". A human reading both names can see they
 * are the same club; a string comparison cannot.
 */
const numArg = (flag) => {
  const a = args.find((x) => x.startsWith(`${flag}=`));
  if (!a) return null;
  const n = Number(a.slice(flag.length + 1));
  return Number.isFinite(n) ? n : null;
};
const forceCompetition = numArg('--competition');
const forceTeam = numArg('--team');

if (forceTeam != null && (forceCompetition == null || !only)) {
  console.error('--team needs both --only="<club>" and --competition=<id>.');
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
const PROXY_TOKEN = process.env.TR_PROXY_BEARER_TOKEN;

if (!URL || !KEY || !EMAIL || !PASSWORD || !PROXY_TOKEN) {
  console.error('Need SUPABASE_URL/KEY (or .env), ADMIN_EMAIL, ADMIN_PASSWORD, TR_PROXY_BEARER_TOKEN.');
  console.error('TR_PROXY_BEARER_TOKEN is the value you set as an edge-function secret.');
  process.exit(1);
}

const PROXY = `${URL}/functions/v1/tr-proxy`;
const THROTTLE_MS = 400;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Same shape of name-flattening the club-name audit uses. */
const CLUB_WORDS = new Set([
  'fc', 'cf', 'ca', 'sc', 'ec', 'ac', 'afc', 'cd', 'sd', 'ss', 'as', 'rc', 'sv', 'vfl', 'vfb',
  'club', 'clube', 'futebol', 'football', 'futbol', 'de', 'do', 'da', 'of', 'the',
]);

function normalize(name) {
  const base = String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/).filter(Boolean);
  const kept = base.filter((w) => !CLUB_WORDS.has(w) && !/^\d+$/.test(w));
  return (kept.length ? kept : base).join(' ');
}

function contains(a, b) {
  const A = new Set(a.split(' '));
  const B = new Set(b.split(' '));
  const shared = [...A].filter((w) => B.has(w)).length;
  return shared === 0 ? 0 : shared / Math.min(A.size, B.size);
}

async function proxy(path) {
  const r = await fetch(`${PROXY}${path}`, {
    headers: { Authorization: `Bearer ${PROXY_TOKEN}` },
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`proxy ${r.status} on ${path}: ${body.slice(0, 200)}`);
  }
  return r.json();
}

const supabase = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { error: authErr } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (authErr) { console.error(`Sign-in failed: ${authErr.message}`); process.exit(1); }

// ── The competition list, once ──
const competitions = await proxy('/competitions');
if (!Array.isArray(competitions)) {
  console.error('TransferRoom did not return a competition list.');
  process.exit(1);
}

const compId = (c) => c.CompetitionId ?? c.competitionId ?? c.Id ?? c.id;
const compName = (c) => c.Name ?? c.CompetitionName ?? c.name ?? '';
const compCountry = (c) => c.Country ?? c.CountryName ?? c.country ?? '';

if (listCompetitions) {
  // Hundreds of competitions, so --only doubles as a filter here.
  const shown = competitions
    .filter((c) => !only
      || `${compCountry(c)} ${compName(c)}`.toLowerCase().includes(only))
    .sort((a, b) => String(compCountry(a)).localeCompare(String(compCountry(b))));
  console.log(`${shown.length} of ${competitions.length} competitions${only ? ` matching "${only}"` : ''}\n`);
  for (const c of shown) {
    console.log(`  ${String(compId(c)).padStart(6)}  ${compCountry(c) || '—'} — ${compName(c)}`);
  }
  process.exit(0);
}

// ── Which clubs need this ──
const { data: clubs, error: clubErr } = await supabase
  .from('clubs').select('id, name, country, league, tr_team_id, tr_competition_id');
if (clubErr) { console.error(`Could not read clubs: ${clubErr.message}`); process.exit(1); }

const { data: players, error: pErr } = await supabase
  .from('scouted_targets').select('name, current_club, league, owner_club, owner_league, loan_club, loan_league');
if (pErr) { console.error(`Could not read roster: ${pErr.message}`); process.exit(1); }

const clubByName = new Map(clubs.map((c) => [c.name, c]));

/**
 * Every club the roster points at, with the league the roster believes it is in.
 * The league is the only hint we have for which competition to open, and it
 * comes from the roster rather than the clubs table because a club the
 * directory never had has no league recorded.
 */
const wanted = new Map();
const note = (club, league) => {
  if (!club) return;
  if (only && !club.toLowerCase().includes(only)) return;
  const existing = clubByName.get(club);
  if (existing?.tr_team_id && existing?.tr_competition_id) return;  // already resolved
  if (!wanted.has(club)) wanted.set(club, { club, league: league || existing?.league || '', players: [] });
  wanted.get(club).players.push(club);
};

for (const p of players) {
  note(p.current_club, p.league);
  note(p.owner_club, p.owner_league);
  note(p.loan_club, p.loan_league);
}

if (wanted.size === 0 && forceTeam == null && !listTeams) {
  console.log('Every club the roster references already has TransferRoom identifiers.');
  process.exit(0);
}

console.log(`${wanted.size} clubs on the roster have no TransferRoom mapping\n`);

/** Competitions worth opening for a given league string. */
function candidateCompetitions(league) {
  if (forceCompetition != null) {
    const c = competitions.find((x) => Number(compId(x)) === forceCompetition);
    return c ? [c] : [];
  }
  const n = normalize(league);
  if (!n) return [];
  return competitions
    .map((c) => ({
      c,
      score: Math.max(
        contains(n, normalize(compName(c))),
        contains(n, normalize(`${compCountry(c)} ${compName(c)}`)),
      ),
    }))
    .filter((x) => x.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.c);
}

const TEAM_ID_FIELDS = ['CurrentTeamTRId', 'TeamTRId', 'ClubTRId', 'CurrentTeamId', 'TeamId', 'ClubId'];
const TEAM_NAME_FIELDS = ['CurrentTeam', 'CurrentTeamName', 'TeamName', 'ClubName', 'Team', 'Club'];

const pick = (row, fields) => {
  for (const f of fields) if (row?.[f] != null && row[f] !== '') return row[f];
  return undefined;
};

/** Distinct teams inside a competition, read once and cached for 24h. */
const rosterCache = new Map();
async function teamsIn(competitionId) {
  if (rosterCache.has(competitionId)) return rosterCache.get(competitionId);

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: cached } = await supabase
    .from('tr_competition_players_cache')
    .select('players_json')
    .eq('competition_id', competitionId)
    .gte('fetched_at', dayAgo)
    .maybeSingle();

  let rows = Array.isArray(cached?.players_json) ? cached.players_json : null;
  if (!rows) {
    rows = await proxy(`/players?competitionid=${competitionId}`);
    await sleep(THROTTLE_MS);
    if (!Array.isArray(rows)) rows = [];
    await supabase.from('tr_competition_players_cache').upsert(
      { competition_id: competitionId, players_json: rows, fetched_at: new Date().toISOString() },
      { onConflict: 'competition_id' },
    );
  }

  const teams = new Map();
  for (const r of rows) {
    const id = pick(r, TEAM_ID_FIELDS);
    const name = pick(r, TEAM_NAME_FIELDS);
    if (id != null && name) teams.set(Number(id), String(name));
  }
  rosterCache.set(competitionId, teams);
  return teams;
}

// ── Direct mapping, decided by a human ──
if (forceTeam != null) {
  // The club may not be in the table at all — that is the usual reason it needs
  // a mapping written by hand. So match on the roster first: that is where the
  // name came from, and it carries the league to file the new club under.
  const { data: onRoster } = await supabase
    .from('scouted_targets')
    .select('current_club, league, owner_club, owner_league, loan_club, loan_league');

  const found = new Map();
  for (const r of onRoster ?? []) {
    for (const [club, league] of [
      [r.current_club, r.league], [r.owner_club, r.owner_league], [r.loan_club, r.loan_league],
    ]) {
      if (club && club.toLowerCase().includes(only)) found.set(club, league || '');
    }
  }

  if (found.size === 0) {
    console.error(`No club on the roster matching "${only}".`);
    process.exit(1);
  }
  if (found.size > 1) {
    console.error(`"${only}" matches more than one club: ${[...found.keys()].join(', ')}`);
    process.exit(1);
  }

  const [rosterName, league] = [...found.entries()][0];

  // What TransferRoom calls this team. Worth knowing even when we keep our own
  // name, because a mismatch here is usually a sign the wrong id was picked.
  let trName = null;
  try {
    trName = (await teamsIn(forceCompetition)).get(forceTeam) ?? null;
  } catch (e) {
    console.warn(`  (could not read competition ${forceCompetition}: ${e.message})`);
  }

  // The clubs row has to be named exactly as the roster names the club —
  // enrichment looks it up by that string. So renaming the club means renaming
  // it on the players too, or the lookup stops finding anything.
  const name = rename && trName ? trName : rosterName;
  if (rename && !trName) {
    console.error('--rename needs the team name from TransferRoom, which could not be read.');
    process.exit(1);
  }

  console.log(`${rosterName}  ->  team ${forceTeam}, competition ${forceCompetition}`);
  if (trName) console.log(`  TransferRoom calls it: ${trName}`);
  if (rename) console.log(`  --rename: the roster's "${rosterName}" becomes "${trName}" too`);

  const { data: existing } = await supabase
    .from('clubs').select('id, name, league, country, tier').eq('name', name).maybeSingle();
  console.log(existing ? '  (updating the existing clubs row)' : `  (creating a clubs row, league "${league || '—'}")`);

  if (!apply) { console.log('\nRead-only. Add --apply to write it.'); process.exit(0); }

  const { error } = await supabase.from('clubs').upsert({
    name,
    league: existing?.league || league || null,
    country: existing?.country ?? null,
    tier: existing?.tier ?? null,
    tr_team_id: forceTeam,
    tr_competition_id: forceCompetition,
  }, { onConflict: 'name' });

  if (error) { console.error(`Failed: ${error.message}`); process.exit(1); }

  if (rename && name !== rosterName) {
    let moved = 0;
    for (const col of ['current_club', 'owner_club', 'loan_club']) {
      const { count, error: e } = await supabase
        .from('scouted_targets')
        .update({ [col]: name }, { count: 'exact' })
        .eq(col, rosterName);
      if (e) { console.error(`Failed renaming ${col}: ${e.message}`); process.exit(1); }
      moved += count ?? 0;
    }
    console.log(`  renamed ${moved} roster reference${moved === 1 ? '' : 's'} to "${name}"`);
  }

  console.log('Written. Re-run enrichment from the roster to pick it up.');
  process.exit(0);
}

// ── Every team in one competition, for when no string match can get there ──
//
// A club is often known by a completely different word in another language —
// "Estrela Vermelha" is "Crvena Zvezda" is "Red Star", and no amount of
// normalising bridges that. Print the list and let a person recognise it.
if (listTeams) {
  if (forceCompetition == null) {
    console.error('--list-teams needs --competition=<id>. Find one with --list-competitions.');
    process.exit(1);
  }
  const c = competitions.find((x) => Number(compId(x)) === forceCompetition);
  if (!c) { console.error(`No competition ${forceCompetition} in the list.`); process.exit(1); }

  const teams = await teamsIn(forceCompetition);
  const rows = [...teams.entries()]
    .filter(([, name]) => !only || name.toLowerCase().includes(only))
    .sort((a, b) => a[1].localeCompare(b[1]));
  console.log(`${rows.length} teams in ${compCountry(c)} — ${compName(c)}\n`);
  for (const [id, name] of rows) console.log(`  ${String(id).padStart(7)}  ${name}`);
  console.log('\n  Map one with:  --only="<roster name>" --competition=' + forceCompetition + ' --team=<id> --apply');
  process.exit(0);
}

const resolved = [];
const ambiguous = [];
const notFound = [];

for (const w of wanted.values()) {
  const comps = candidateCompetitions(w.league);
  if (comps.length === 0) {
    notFound.push({ ...w, why: `no competition matched league "${w.league || '(none recorded)'}"` });
    continue;
  }

  const target = normalize(w.club);
  let exact = null;
  const near = [];

  for (const c of comps) {
    let teams;
    try {
      teams = await teamsIn(compId(c));
    } catch (e) {
      notFound.push({ ...w, why: `could not read ${compName(c)}: ${e.message}` });
      continue;
    }
    for (const [id, name] of teams) {
      const score = contains(target, normalize(name));
      if (normalize(name) === target) exact = { id, name, competition: c };
      else if (score >= 0.5) near.push({ id, name, competition: c, score });
    }
    if (exact) break;
  }

  if (exact) {
    resolved.push({ ...w, ...exact });
  } else if (near.length) {
    ambiguous.push({ ...w, near: near.sort((a, b) => b.score - a.score).slice(0, 5) });
  } else {
    notFound.push({ ...w, why: `no team in ${comps.map(compName).join(', ')} looked like it` });
  }
}

if (resolved.length) {
  console.log('Resolved — exact team name inside the competition:\n');
  for (const r of resolved) {
    console.log(`  ${r.club}  ->  ${r.name}  (team ${r.id}, competition ${compId(r.competition)} ${compName(r.competition)})`);
  }
  console.log('');
}

if (ambiguous.length) {
  console.log('Close but not exact — check these, nothing is written:\n');
  for (const a of ambiguous) {
    console.log(`  ${a.club}   [league: ${a.league || '—'}]`);
    for (const n of a.near) {
      console.log(`      ${n.name}  (team ${n.id}, competition ${compId(n.competition)} ${compName(n.competition)})`);
    }
  }
  console.log('');
}

if (notFound.length) {
  console.log('Not resolved:\n');
  for (const n of notFound) console.log(`  ${n.club} — ${n.why}`);
  console.log('\n  --list-competitions shows what TransferRoom offers, if a league name is the problem.\n');
}

if (!apply) {
  if (resolved.length) console.log('Read-only. Re-run with --apply to write the resolved mappings.');
  process.exit(0);
}

if (!resolved.length) { console.log('Nothing to apply.'); process.exit(0); }

let ok = 0;
const fails = [];
for (const r of resolved) {
  const existing = clubByName.get(r.club);
  const row = {
    name: r.club,
    league: existing?.league || r.league || compName(r.competition),
    country: existing?.country ?? compCountry(r.competition) ?? null,
    tier: existing?.tier ?? null,
    tr_team_id: r.id,
    tr_competition_id: compId(r.competition),
  };
  const { error } = await supabase.from('clubs').upsert(row, { onConflict: 'name' });
  if (error) fails.push({ club: r.club, error: error.message });
  else ok++;
  await sleep(40);
}

console.log(`\napplied ${ok}/${resolved.length}`);
fails.slice(0, 10).forEach((f) => console.error(`  !! ${f.club}: ${f.error}`));
if (fails.length) process.exit(1);
console.log('Re-run enrichment from the roster to pick these up.');
