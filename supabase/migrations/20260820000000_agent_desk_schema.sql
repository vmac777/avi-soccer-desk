-- Agent desk schema.
--
-- Everything above this migration is inherited from the club-side trading desk.
-- This one adapts the model for an agency: a roster we hold mandates over, a
-- player pitched to many clubs at once, and structured club requirements to
-- match that roster against.

-- ---------------------------------------------------------------------------
-- 1. Remove inherited cron jobs
-- ---------------------------------------------------------------------------
-- Four call edge functions this deployment never deploys, so they would fail on
-- a schedule forever — retry-super-urgent every five minutes — purely producing
-- noise in the logs.
--
-- The fifth matters more. tr-competition-snapshot-daily copies whole-competition
-- jsonb blobs from tr_competition_players_cache into
-- tr_competition_players_history, one row per competition per day, indefinitely.
-- That is not dormant: scouted-target-enrich-tr, which we do deploy, fills the
-- cache whenever a roster player is enriched. Nothing in this app ever reads the
-- history table — the xTV chart uses squad_player_xtv_history — so it is
-- unbounded write-only growth, of exactly the table whose bulk reads brought
-- down the database this codebase came from.
--
-- Re-add any of these individually if a feature ever needs one.

DO $$
DECLARE
  -- Named v_jobname, not `job`: pg_cron stores its schedule in a table called
  -- cron.job, so a variable called `job` makes `WHERE jobname = job` ambiguous
  -- and the whole block fails to parse.
  v_jobname text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOREACH v_jobname IN ARRAY ARRAY[
      'daily-news-digest',
      'digest-retry',
      'retry-super-urgent',
      'cleanup-rate-limits',
      'tr-competition-snapshot-daily'
    ] LOOP
      IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = v_jobname) THEN
        PERFORM cron.unschedule(v_jobname);
      END IF;
    END LOOP;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. One player, many clubs
-- ---------------------------------------------------------------------------
-- The club-side desk chased one target and bought it once, so a single pitch per
-- player was correct. An agency pitches the same client to several clubs at the
-- same time, which that constraint forbids. Uniqueness moves to the pair.

ALTER TABLE public.buy_pitches
  DROP CONSTRAINT IF EXISTS buy_pitches_one_per_target;

ALTER TABLE public.buy_pitches
  ADD CONSTRAINT buy_pitches_one_per_target_per_contact
  UNIQUE (scouted_target_id, contact_id);

-- ---------------------------------------------------------------------------
-- 3. Roster columns
-- ---------------------------------------------------------------------------
-- scouted_targets becomes the agency's client roster. It already carries
-- identity, club, and TransferRoom enrichment; these add what an agency holds
-- over a player, plus a highlight video, which had no column anywhere before.

ALTER TABLE public.scouted_targets
  ADD COLUMN IF NOT EXISTS video_url      text,
  ADD COLUMN IF NOT EXISTS mandate_start  date,
  ADD COLUMN IF NOT EXISTS mandate_end    date,
  ADD COLUMN IF NOT EXISTS exclusive      boolean,
  ADD COLUMN IF NOT EXISTS commission_pct numeric,
  ADD COLUMN IF NOT EXISTS sell_on_pct    numeric;

-- Per-field provenance: 'verified' | 'transfermarkt' | 'placeholder', keyed by
-- column name. Rows are seeded from a Transfermarkt list, which publishes no
-- reliable contract data, so contract_end in particular is often filled in by
-- hand.
--
-- Contract expiry decides when a player may talk to other clubs and where the
-- leverage sits. A hand-filled date must never read as a known one, so anything
-- marked placeholder is badged in the UI, omitted from client-facing PDFs, and
-- ignored by the matching engine. An absent key is treated as placeholder.
ALTER TABLE public.scouted_targets
  ADD COLUMN IF NOT EXISTS data_provenance jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.scouted_targets.data_provenance IS
  'Per-field source: verified | transfermarkt | placeholder, keyed by column name. Missing key means placeholder.';

-- ---------------------------------------------------------------------------
-- 4. What a club is looking for
-- ---------------------------------------------------------------------------
-- contacts.needs is free text and always will be — it holds nuance no column
-- captures. This sits alongside it, structured enough to match a roster against.
-- Nothing is migrated out of needs.

CREATE TABLE IF NOT EXISTS public.club_requirements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id        uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,

  position          text NOT NULL,
  age_min           integer,
  age_max           integer,
  budget_min        numeric,
  budget_max        numeric,
  salary_max        numeric,
  foot              text,
  needs_eu_passport boolean NOT NULL DEFAULT false,
  league_experience text[]  NOT NULL DEFAULT '{}',
  window_target     text,

  status            text NOT NULL DEFAULT 'open',
  notes             text,

  created_by        uuid REFERENCES auth.users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT club_requirements_status_chk
    CHECK (status IN ('open', 'filled', 'withdrawn')),
  CONSTRAINT club_requirements_age_range_chk
    CHECK (age_min IS NULL OR age_max IS NULL OR age_min <= age_max),
  CONSTRAINT club_requirements_budget_range_chk
    CHECK (budget_min IS NULL OR budget_max IS NULL OR budget_min <= budget_max)
);

CREATE INDEX IF NOT EXISTS idx_club_requirements_contact
  ON public.club_requirements (contact_id);

-- Partial index: matching only ever scans open requirements.
CREATE INDEX IF NOT EXISTS idx_club_requirements_open
  ON public.club_requirements (position)
  WHERE status = 'open';

ALTER TABLE public.club_requirements ENABLE ROW LEVEL SECURITY;

-- Matches the pattern used across this schema: admins of the project hold the
-- desk. Isolation between clients is per-project, not per-row.
DROP POLICY IF EXISTS club_requirements_admin_all ON public.club_requirements;
CREATE POLICY club_requirements_admin_all ON public.club_requirements
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_requirements TO authenticated;
GRANT ALL ON public.club_requirements TO service_role;

-- updated_at maintenance, reusing the trigger function this schema already
-- defines for other tables.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column'
  ) THEN
    DROP TRIGGER IF EXISTS set_club_requirements_updated_at ON public.club_requirements;
    CREATE TRIGGER set_club_requirements_updated_at
      BEFORE UPDATE ON public.club_requirements
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
