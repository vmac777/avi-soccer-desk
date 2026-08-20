CREATE TABLE IF NOT EXISTS public.club_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id UUID REFERENCES public.clubs(id) ON DELETE CASCADE,
  angle TEXT NOT NULL CHECK (angle IN ('buy', 'sell', 'scout')),
  player_scope JSONB,
  generated_by UUID REFERENCES public.profiles(id),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_ms INTEGER,
  source_status JSONB,
  brief_json JSONB,
  total_input_tokens INTEGER,
  total_output_tokens INTEGER,
  total_search_calls INTEGER
);

CREATE INDEX IF NOT EXISTS idx_club_briefs_user_time ON public.club_briefs(generated_by, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_club_briefs_club_time ON public.club_briefs(club_id, generated_at DESC);

ALTER TABLE public.club_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "club_briefs_admin_select" ON public.club_briefs
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "club_briefs_admin_insert" ON public.club_briefs
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());