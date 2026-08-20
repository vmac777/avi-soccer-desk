
-- Create pitches table to persist player-to-contact deal tracking
CREATE TABLE public.pitches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id TEXT NOT NULL,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  stage TEXT NOT NULL DEFAULT 'Identified',
  notes TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pitches ENABLE ROW LEVEL SECURITY;

-- All authenticated users can CRUD pitches (internal team tool)
CREATE POLICY "Authenticated users can read pitches"
  ON public.pitches FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert pitches"
  ON public.pitches FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update pitches"
  ON public.pitches FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete pitches"
  ON public.pitches FOR DELETE TO authenticated USING (true);

-- Auto-update updated_at
CREATE TRIGGER update_pitches_updated_at
  BEFORE UPDATE ON public.pitches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for common lookups
CREATE INDEX idx_pitches_player_id ON public.pitches(player_id);
CREATE INDEX idx_pitches_contact_id ON public.pitches(contact_id);
