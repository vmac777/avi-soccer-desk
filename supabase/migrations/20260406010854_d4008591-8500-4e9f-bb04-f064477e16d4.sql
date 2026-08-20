CREATE TABLE IF NOT EXISTS public.settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read settings"
  ON public.settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can update settings"
  ON public.settings FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert settings"
  ON public.settings FOR INSERT
  TO authenticated
  WITH CHECK (true);

INSERT INTO public.settings (key, value) VALUES ('sell_pipeline_target', '35000000')
ON CONFLICT (key) DO NOTHING;