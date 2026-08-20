CREATE TABLE public.tr_competition_transfers_cache (
  competition_id INTEGER PRIMARY KEY,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  transfers_json JSONB NOT NULL
);

ALTER TABLE public.tr_competition_transfers_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tr_cache_admin_all"
  ON public.tr_competition_transfers_cache
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());