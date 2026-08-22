-- Store the club news reports the desk generates, not just show them.
--
-- An agent's first question about a club is "what is going on there right now",
-- and until now the desk could not answer it. This table is where the answer
-- lands: one row per generated report, keyed to the club.
--
-- Keeping the rows matters beyond history. A report is assembled from whatever
-- the source URLs happened to return that minute, and a report built from three
-- blocked pages reads exactly like one built from three good pages — same
-- confident prose, a third of the evidence. `source_status` records what each
-- URL actually gave back, so the difference is visible rather than inferred.
-- The Transfermarkt failure taught that lesson at the cost of a week.

CREATE TABLE IF NOT EXISTS public.club_news_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  generated_by uuid REFERENCES public.profiles(id),
  generated_at timestamptz NOT NULL DEFAULT now(),
  duration_ms integer,
  -- Per-URL outcome: [{ url, label, status: 'ok'|'http_error'|..., chars }]
  source_status jsonb,
  report_json jsonb,
  model text,
  web_search_calls integer,
  input_tokens integer,
  output_tokens integer
);

CREATE INDEX IF NOT EXISTS idx_club_news_reports_club_time
  ON public.club_news_reports(club_id, generated_at DESC);

ALTER TABLE public.club_news_reports ENABLE ROW LEVEL SECURITY;

-- Admin-only, both ways. Generating a report spends metered Anthropic credit and
-- the result names who the agency should pitch; neither is intern business.
CREATE POLICY "club_news_reports_admin_select" ON public.club_news_reports
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "club_news_reports_admin_insert" ON public.club_news_reports
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());
