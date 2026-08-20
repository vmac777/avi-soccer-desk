CREATE TABLE public.buy_negotiation_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  buy_pitch_id uuid NOT NULL REFERENCES public.buy_pitches(id) ON DELETE CASCADE,
  entry_type text NOT NULL DEFAULT 'Our Offer',
  amount numeric,
  note text DEFAULT '',
  logged_by text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.buy_negotiation_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read negotiation entries"
  ON public.buy_negotiation_entries FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert negotiation entries"
  ON public.buy_negotiation_entries FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can delete negotiation entries"
  ON public.buy_negotiation_entries FOR DELETE TO authenticated USING (true);