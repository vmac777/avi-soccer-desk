ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS tr_team_id INTEGER;
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS tr_competition_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_clubs_tr_team_id ON public.clubs(tr_team_id);

CREATE TABLE IF NOT EXISTS public.tr_recon_unmatched (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clubs_name TEXT NOT NULL,
  tr_candidates JSONB,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tr_recon_unmatched ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tr_recon_unmatched_admin_all" ON public.tr_recon_unmatched;
CREATE POLICY "tr_recon_unmatched_admin_all" ON public.tr_recon_unmatched
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());