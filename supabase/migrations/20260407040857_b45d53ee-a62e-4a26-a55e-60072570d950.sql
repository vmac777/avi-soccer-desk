CREATE TABLE public.player_recommendations (
  player_slug TEXT NOT NULL PRIMARY KEY,
  sell_or_hold TEXT NOT NULL DEFAULT 'HOLD',
  verdict TEXT NOT NULL DEFAULT '',
  target_price TEXT NOT NULL DEFAULT '',
  rationale TEXT NOT NULL DEFAULT '',
  urgency TEXT NOT NULL DEFAULT 'MEDIUM',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.player_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read recommendations"
ON public.player_recommendations FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert recommendations"
ON public.player_recommendations FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update recommendations"
ON public.player_recommendations FOR UPDATE TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete recommendations"
ON public.player_recommendations FOR DELETE TO authenticated
USING (true);