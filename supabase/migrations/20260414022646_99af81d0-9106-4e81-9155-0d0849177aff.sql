CREATE TABLE IF NOT EXISTS public.follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_club TEXT NOT NULL,
  due_date DATE NOT NULL,
  action_text TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read follow_ups"
  ON public.follow_ups FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert follow_ups"
  ON public.follow_ups FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update follow_ups"
  ON public.follow_ups FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete follow_ups"
  ON public.follow_ups FOR DELETE TO authenticated USING (true);