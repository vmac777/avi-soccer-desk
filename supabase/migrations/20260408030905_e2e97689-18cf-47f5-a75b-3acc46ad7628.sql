
-- Scouted Targets table
CREATE TABLE public.scouted_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  position TEXT DEFAULT '',
  age INTEGER,
  date_of_birth DATE,
  nationality TEXT DEFAULT '',
  current_club TEXT DEFAULT '',
  contract_end DATE,
  market_value NUMERIC,
  height TEXT DEFAULT '',
  foot TEXT DEFAULT '',
  photo_url TEXT DEFAULT '',
  salary_estimate NUMERIC,
  agent_name TEXT DEFAULT '',
  agent_contact TEXT DEFAULT '',
  priority_ranking TEXT DEFAULT 'Medium',
  notes TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.scouted_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read scouted targets"
  ON public.scouted_targets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert scouted targets"
  ON public.scouted_targets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update scouted targets"
  ON public.scouted_targets FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete scouted targets"
  ON public.scouted_targets FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_scouted_targets_updated_at
  BEFORE UPDATE ON public.scouted_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Buy Pitches table
CREATE TABLE public.buy_pitches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scouted_target_id UUID NOT NULL REFERENCES public.scouted_targets(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  stage TEXT NOT NULL DEFAULT 'Scouted',
  asking_price NUMERIC,
  current_offer NUMERIC,
  final_price NUMERIC,
  notes TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.buy_pitches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read buy pitches"
  ON public.buy_pitches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert buy pitches"
  ON public.buy_pitches FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update buy pitches"
  ON public.buy_pitches FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete buy pitches"
  ON public.buy_pitches FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_buy_pitches_updated_at
  BEFORE UPDATE ON public.buy_pitches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Buy Pitch Notes table
CREATE TABLE public.buy_pitch_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  buy_pitch_id UUID NOT NULL REFERENCES public.buy_pitches(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  logged_by TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.buy_pitch_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read buy pitch notes"
  ON public.buy_pitch_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert buy pitch notes"
  ON public.buy_pitch_notes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can delete buy pitch notes"
  ON public.buy_pitch_notes FOR DELETE TO authenticated USING (true);

-- Buy Pitch Documents table
CREATE TABLE public.buy_pitch_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  buy_pitch_id UUID NOT NULL REFERENCES public.buy_pitches(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  content_type TEXT,
  uploaded_by TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.buy_pitch_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read buy pitch documents"
  ON public.buy_pitch_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert buy pitch documents"
  ON public.buy_pitch_documents FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can delete buy pitch documents"
  ON public.buy_pitch_documents FOR DELETE TO authenticated USING (true);
