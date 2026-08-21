import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The checker's own failure mode is silence.
 *
 * It is a pile of regexes over SQL and over a generated TypeScript file, and
 * when one of them does not match, the thing it was looking at simply is not
 * seen — no error, no warning, a clean pass. That happened while writing it: a
 * hand-made fixture used a compact `Row: { id: string }` instead of the
 * generator's multi-line shape, the phantom table was invisible, and the check
 * reported "no drift" on input built to fail.
 *
 * A green check that cannot go red is worse than no check, because everyone
 * downstream believes it. These feed it known-bad input and insist it says so.
 */

const SCRIPT = join(process.cwd(), 'scripts/check-schema-drift.mjs');

let dir: string;
let migrations: string;
let typesFile: string;

/** The generator's exact formatting. Anything else proves nothing. */
function typesFileWith(tables: Record<string, string[]>, views: string[] = []) {
  const block = (name: string, cols: string[]) => `      ${name}: {
        Row: {
${cols.map((c) => `          ${c}: string`).join('\n')}
        }
        Insert: {
${cols.map((c) => `          ${c}?: string`).join('\n')}
        }
        Update: {
${cols.map((c) => `          ${c}?: string`).join('\n')}
        }
        Relationships: []
      }`;

  return `export type Json = string
export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
${Object.entries(tables).map(([n, c]) => block(n, c)).join('\n')}
    }
    Views: {
${views.map((v) => block(v, ['id'])).join('\n')}
    }
    Functions: {
      [_ in never]: never
    }
  }
}
`;
}

function run() {
  try {
    const stdout = execFileSync('node', [SCRIPT, migrations, typesFile], { encoding: 'utf8' });
    return { code: 0, out: stdout };
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string };
    return { code: err.status, out: (err.stdout ?? '') + (err.stderr ?? '') };
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'drift-'));
  migrations = join(dir, 'migrations');
  typesFile = join(dir, 'types.ts');
  mkdirSync(migrations);
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

const migration = (name: string, sql: string) => writeFileSync(join(migrations, name), sql);

describe('check-schema-drift', () => {
  it('passes when the two agree', () => {
    migration('001_init.sql', `
CREATE TABLE public.players (
  id uuid PRIMARY KEY,
  name text NOT NULL
);`);
    writeFileSync(typesFile, typesFileWith({ players: ['id', 'name'] }));

    const { code, out } = run();
    expect(code, out).toBe(0);
    expect(out).toContain('in both directions');
  });

  it('fails on a column the migrations add and the types lack', () => {
    migration('001_init.sql', `
CREATE TABLE public.players (
  id uuid PRIMARY KEY,
  name text NOT NULL
);`);
    migration('002_alter.sql', 'ALTER TABLE public.players ADD COLUMN nickname text;');
    writeFileSync(typesFile, typesFileWith({ players: ['id', 'name'] }));

    const { code, out } = run();
    expect(code).toBe(1);
    expect(out).toContain('players.nickname');
    expect(out).toContain('002_alter.sql');
  });

  it('fails on a phantom table — the half that used to be blind', () => {
    migration('001_init.sql', `
CREATE TABLE public.players (
  id uuid PRIMARY KEY
);`);
    writeFileSync(typesFile, typesFileWith({
      players: ['id'],
      ghost_cache: ['id', 'payload'],
    }));

    const { code, out } = run();
    expect(code).toBe(1);
    expect(out).toContain('ghost_cache');
    expect(out).toContain('no migration creates it');
    // Once for the table, not once per column.
    expect(out.match(/ghost_cache/g)).toHaveLength(1);
  });

  it('fails on a phantom column on a real table', () => {
    migration('001_init.sql', `
CREATE TABLE public.players (
  id uuid PRIMARY KEY
);`);
    writeFileSync(typesFile, typesFileWith({ players: ['id', 'invented'] }));

    const { code, out } = run();
    expect(code).toBe(1);
    expect(out).toContain('players.invented');
    expect(out).toContain('no migration adds it');
  });

  it('does not mistake a view for a phantom table', () => {
    // Views live in the same shape one section down. Reading the whole file
    // would flag every one of them, which is how a check gets switched off.
    migration('001_init.sql', `
CREATE TABLE public.players (
  id uuid PRIMARY KEY
);`);
    writeFileSync(typesFile, typesFileWith({ players: ['id'] }, ['players_enriched']));

    const { code, out } = run();
    expect(code, out).toBe(0);
  });

  it('follows a renamed column to its new name', () => {
    migration('001_init.sql', `
CREATE TABLE public.players (
  id uuid PRIMARY KEY,
  old_name text
);`);
    migration('002_rename.sql', 'ALTER TABLE public.players RENAME COLUMN old_name TO new_name;');
    writeFileSync(typesFile, typesFileWith({ players: ['id', 'new_name'] }));

    const { code, out } = run();
    expect(code, out).toBe(0);
  });

  it('treats a dropped column as correctly absent', () => {
    migration('001_init.sql', `
CREATE TABLE public.players (
  id uuid PRIMARY KEY,
  temporary text
);`);
    migration('002_drop.sql', 'ALTER TABLE public.players DROP COLUMN temporary;');
    writeFileSync(typesFile, typesFileWith({ players: ['id'] }));

    const { code, out } = run();
    expect(code, out).toBe(0);
  });

  it('treats a dropped table as correctly absent', () => {
    migration('001_init.sql', `
CREATE TABLE public.scratch (
  id uuid PRIMARY KEY
);`);
    migration('002_drop.sql', 'DROP TABLE IF EXISTS public.scratch;');
    migration('003_real.sql', `
CREATE TABLE public.players (
  id uuid PRIMARY KEY
);`);
    writeFileSync(typesFile, typesFileWith({ players: ['id'] }));

    const { code, out } = run();
    expect(code, out).toBe(0);
  });

  it('refuses a types file it cannot parse rather than passing it', () => {
    // The dangerous case: unreadable input must not read as "no drift".
    migration('001_init.sql', 'CREATE TABLE public.players (\n  id uuid PRIMARY KEY\n);');
    writeFileSync(typesFile, 'export type Database = { nothing: true }\n');

    const { code, out } = run();
    expect(code).toBe(1);
    expect(out).toMatch(/public\.Tables/);
  });

  it('ignores constraint lines inside a CREATE TABLE', () => {
    migration('001_init.sql', `
CREATE TABLE public.players (
  id uuid PRIMARY KEY,
  status text NOT NULL,
  CONSTRAINT players_status_chk CHECK (status IN ('a', 'b')),
  UNIQUE (id, status)
);`);
    writeFileSync(typesFile, typesFileWith({ players: ['id', 'status'] }));

    const { code, out } = run();
    expect(code, out).toBe(0);
  });
});
