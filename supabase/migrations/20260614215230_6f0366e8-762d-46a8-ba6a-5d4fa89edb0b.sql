ALTER TABLE public.scouted_targets
  ADD COLUMN IF NOT EXISTS tm_player_id text,
  ADD COLUMN IF NOT EXISTS xtv numeric,
  ADD COLUMN IF NOT EXISTS xtv_as_of date,
  ADD COLUMN IF NOT EXISTS gbe_score text,
  ADD COLUMN IF NOT EXISTS tr_salary numeric,
  ADD COLUMN IF NOT EXISTS tr_availability text,
  ADD COLUMN IF NOT EXISTS tr_asking_price numeric,
  ADD COLUMN IF NOT EXISTS tr_data jsonb,
  ADD COLUMN IF NOT EXISTS tm_status text,
  ADD COLUMN IF NOT EXISTS tr_status text,
  ADD COLUMN IF NOT EXISTS enrichment_notes text;

-- Existing GRANTs on scouted_targets already cover authenticated + service_role;
-- new columns inherit table-level privileges, no additional GRANT needed.