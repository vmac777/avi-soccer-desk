#!/usr/bin/env node
/**
 * Keeps the generated Supabase types honest against the migrations, in both
 * directions.
 *
 * `src/integrations/supabase/types.ts` is supposed to be generated from the
 * live database, but it is a normal file in the repo and nothing stopped
 * someone hand-editing it. It drifted two ways at once:
 *
 *   * **Migrations ahead of types.** Twenty-one columns — every column the
 *     agent desk added since the repo was seeded — were missing. The query
 *     code papered over it with `from('buy_pitches' as any)`, and those casts
 *     turn a column typo into a runtime failure in a user's browser. That is
 *     how "Could not find the 'buying_track' column" shipped.
 *
 *   * **Types ahead of migrations.** `tr_club_rosters_cache` sat in the types
 *     describing a table that no migration creates and the database has never
 *     had. It came in with the Botafogo seed and survived until somebody
 *     regenerated the whole file by hand. A phantom table is the more
 *     dangerous half: code written against one compiles perfectly and fails
 *     only when it runs.
 *
 * Reads the DDL rather than the database, so it runs in CI with no
 * credentials. It cannot see a type that changed (text → integer) or a
 * nullability change — those need a real regeneration. It catches existence,
 * which is the failure this project has actually had, twice.
 *
 * When it fails, the fix is to regenerate rather than hand-patch:
 *   npx supabase gen types typescript --linked > src/integrations/supabase/types.ts
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Paths are overridable so the checker can be pointed at fixtures. Its own
// failure mode is silent under-reporting — a types block whose formatting the
// regexes do not match is simply not seen — and that is only catchable by
// feeding it known-bad input.
const MIGRATIONS = process.argv[2] ?? 'supabase/migrations';
const TYPES = process.argv[3] ?? 'src/integrations/supabase/types.ts';

const types = readFileSync(TYPES, 'utf8');

/**
 * The `public.Tables` block, and only that.
 *
 * Views carry an identical `Row:` shape one section further down, and the
 * `graphql_public` schema has its own empty Tables block above. Reading the
 * whole file would make every view look like a table no migration creates —
 * which is exactly the false positive that would get this check switched off.
 */
function publicTablesBlock(src) {
  const lines = src.split('\n');
  const publicAt = lines.findIndex((l) => l === '  public: {');
  if (publicAt === -1) return null;

  const tablesAt = lines.indexOf('    Tables: {', publicAt);
  const viewsAt = lines.indexOf('    Views: {', tablesAt);
  if (tablesAt === -1 || viewsAt === -1) return null;

  return lines.slice(tablesAt, viewsAt).join('\n');
}

/** table -> the columns its Row block declares. */
function readRowColumns(block) {
  const byTable = new Map();
  for (const m of block.matchAll(/^ {6}(\w+): \{\n {8}Row: \{\n([\s\S]*?)\n {8}\}/gm)) {
    const [, table, body] = m;
    byTable.set(table, new Set(
      [...body.matchAll(/^ {10}(\w+)\??:/gm)].map(([, c]) => c),
    ));
  }
  return byTable;
}

const block = publicTablesBlock(types);
if (!block) {
  console.error(`Could not find the public.Tables block in ${TYPES} — has its shape changed?`);
  process.exit(1);
}

const rowColumns = readRowColumns(block);
if (rowColumns.size === 0) {
  console.error(`Parsed the public.Tables block of ${TYPES} but found no tables in it.`);
  process.exit(1);
}

// ── What the migrations say exists ────────────────────────────────────────
const added = new Map();      // "table.column" -> migration filename
const createdTables = new Map(); // table -> migration filename
const renamedFrom = new Set();
const dropped = new Set();
const droppedTables = new Set();

for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
  const sql = readFileSync(join(MIGRATIONS, file), 'utf8');

  const creates = sql.matchAll(
    /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\s*\);/gi,
  );
  for (const [, table, body] of creates) {
    createdTables.set(table, file);
    droppedTables.delete(table);
    for (const line of body.split('\n')) {
      // Column definitions only: skip constraints, and skip anything indented
      // past the first level, which is a continuation of the line above.
      const m = /^\s{2}(\w+)\s+[a-zA-Z]/.exec(line);
      if (!m) continue;
      const col = m[1];
      if (/^(primary|foreign|unique|check|constraint|exclude)$/i.test(col)) continue;
      added.set(`${table}.${col}`, file);
    }
  }

  const alters = sql.matchAll(/ALTER TABLE\s+(?:public\.)?(\w+)([\s\S]*?);/gi);
  for (const [, table, body] of alters) {
    for (const [, col] of body.matchAll(/ADD COLUMN\s+(?:IF NOT EXISTS\s+)?(\w+)/gi)) {
      added.set(`${table}.${col}`, file);
    }
    for (const [, from, to] of body.matchAll(/RENAME COLUMN\s+(\w+)\s+TO\s+(\w+)/gi)) {
      renamedFrom.add(`${table}.${from}`);
      added.set(`${table}.${to}`, file);
    }
    for (const [, col] of body.matchAll(/DROP COLUMN\s+(?:IF EXISTS\s+)?(\w+)/gi)) {
      dropped.add(`${table}.${col}`);
    }
  }

  for (const [, table] of sql.matchAll(/DROP TABLE\s+(?:IF EXISTS\s+)?(?:public\.)?(\w+)/gi)) {
    droppedTables.add(table);
    createdTables.delete(table);
    for (const key of [...added.keys()]) {
      if (key.startsWith(`${table}.`)) added.delete(key);
    }
  }
}

const problems = [];

// ── Migrations ahead of types ─────────────────────────────────────────────
for (const [key, file] of [...added.entries()].sort()) {
  if (dropped.has(key) || renamedFrom.has(key)) continue;
  const [table, col] = key.split('.');
  const cols = rowColumns.get(table);
  if (!cols) {
    problems.push(`  ${table.padEnd(34)} table created by ${file}, absent from the types`);
  } else if (!cols.has(col)) {
    problems.push(`  ${key.padEnd(34)} column added by ${file}, absent from the types`);
  }
}
// A table missing entirely reports once per column otherwise; collapse it.
const collapsed = [...new Set(problems)];

// ── Types ahead of migrations ─────────────────────────────────────────────
// The half that was blind. A table here that no migration creates does not
// exist in any database this repo can build, and code written against it
// compiles cleanly and fails at runtime.
for (const [table, cols] of [...rowColumns.entries()].sort()) {
  if (!createdTables.has(table)) {
    collapsed.push(
      `  ${table.padEnd(34)} in the types, but no migration creates it`,
    );
    continue;
  }
  for (const col of [...cols].sort()) {
    const key = `${table}.${col}`;
    if (added.has(key) && !dropped.has(key)) continue;
    // Renamed-away columns are correctly absent from a regenerated file; if
    // one is still present, the types are describing the old schema.
    collapsed.push(
      `  ${key.padEnd(34)} in the types, but no migration adds it`,
    );
  }
}

if (collapsed.length === 0) {
  console.log(
    `schema drift: none — ${added.size} migration columns across `
    + `${rowColumns.size} tables match ${TYPES}, in both directions`,
  );
  process.exit(0);
}

console.error(`\n${collapsed.length} disagreement(s) between the migrations and ${TYPES}:\n`);
for (const line of collapsed) console.error(line);
console.error(
  '\nRegenerate the types rather than hand-editing them:\n'
  + `  npx supabase gen types typescript --linked > ${TYPES}\n`,
);
process.exit(1);
