#!/usr/bin/env node
/**
 * Fails if a migration adds a column that the generated Supabase types do not
 * know about.
 *
 * `src/integrations/supabase/types.ts` is supposed to be generated from the
 * live database, but it is a normal file in the repo and nothing stopped
 * someone hand-editing it. It drifted by twenty-one columns — every column the
 * agent desk added since the repo was seeded — and the drift was invisible
 * because the query code worked around it with `from('buy_pitches' as any)`.
 * Those casts turn a column typo into a runtime failure in a user's browser,
 * which is how "Could not find the 'buying_track' column" shipped.
 *
 * This reads the DDL rather than the database, so it runs in CI with no
 * credentials. It cannot catch a type that changed (text → integer) or a
 * nullability change — only a column the types have never heard of. That is
 * the failure this project actually had.
 *
 * When it fails, the fix is to regenerate rather than hand-patch:
 *   npx supabase gen types typescript --linked > src/integrations/supabase/types.ts
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = 'supabase/migrations';
const TYPES = 'src/integrations/supabase/types.ts';

const types = readFileSync(TYPES, 'utf8');

/**
 * table -> columns declared in its Row block.
 *
 * Scoping to the table matters: a first attempt matched the column name
 * anywhere in the file, so a column missing from `buy_pitches` still passed
 * because an unrelated table happened to have one by the same name.
 */
function readRowColumns(src) {
  const byTable = new Map();
  for (const m of src.matchAll(/^ {6}(\w+): \{\n {8}Row: \{\n([\s\S]*?)\n {8}\}/gm)) {
    const [, table, body] = m;
    const cols = new Set(
      [...body.matchAll(/^ {10}(\w+)\??:/gm)].map(([, c]) => c),
    );
    byTable.set(table, cols);
  }
  return byTable;
}

const rowColumns = readRowColumns(types);
if (rowColumns.size === 0) {
  console.error(`could not parse any table Row blocks out of ${TYPES} — has its shape changed?`);
  process.exit(1);
}

const added = new Map();      // "table.column" -> migration filename
const renamedFrom = new Set();
const dropped = new Set();

for (const file of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()) {
  const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
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
}

const missing = [...added.entries()]
  .filter(([key]) => !dropped.has(key) && !renamedFrom.has(key))
  .filter(([key]) => {
    const [table, col] = key.split('.');
    const cols = rowColumns.get(table);
    // A table the types have never heard of at all is drift too.
    return !cols || !cols.has(col);
  })
  .sort();

if (missing.length === 0) {
  console.log(
  `schema drift: none — ${added.size} migration columns across ` +
  `${rowColumns.size} tables match ${TYPES}`,
);
  process.exit(0);
}

console.error(`\n${missing.length} column(s) exist in migrations but not in ${TYPES}:\n`);
for (const [key, file] of missing) console.error(`  ${key.padEnd(44)} added by ${file}`);
console.error(
  '\nRegenerate the types rather than hand-editing them:\n' +
  '  npx supabase gen types typescript --linked > ' + TYPES + '\n',
);
process.exit(1);
