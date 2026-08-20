CREATE TABLE public.tr_proxy_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route TEXT NOT NULL,
  query_string TEXT,
  status_code INTEGER,
  duration_ms INTEGER,
  response_size_bytes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tr_proxy_log_created ON public.tr_proxy_log(created_at DESC);
CREATE INDEX idx_tr_proxy_log_route ON public.tr_proxy_log(route);

ALTER TABLE public.tr_proxy_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tr_proxy_log_admin_select" ON public.tr_proxy_log
  FOR SELECT TO authenticated USING (is_admin());