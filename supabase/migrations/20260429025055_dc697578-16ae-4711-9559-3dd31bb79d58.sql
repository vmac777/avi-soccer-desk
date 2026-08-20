CREATE TABLE IF NOT EXISTS public.tr_player_details_cache (
  tr_player_id INTEGER PRIMARY KEY,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  player_json JSONB NOT NULL
);

ALTER TABLE public.tr_player_details_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tr_player_details_cache_admin_all" ON public.tr_player_details_cache
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

CREATE INDEX IF NOT EXISTS idx_tr_player_details_cache_fetched_at
  ON public.tr_player_details_cache(fetched_at);

ALTER TABLE public.scouted_targets ADD COLUMN IF NOT EXISTS tr_player_id INTEGER;