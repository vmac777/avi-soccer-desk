CREATE TABLE IF NOT EXISTS public.player_notes (
  player_id TEXT PRIMARY KEY,
  notes TEXT DEFAULT '',
  tags JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.player_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read player notes"
  ON public.player_notes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert player notes"
  ON public.player_notes FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update player notes"
  ON public.player_notes FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete player notes"
  ON public.player_notes FOR DELETE TO authenticated USING (true);