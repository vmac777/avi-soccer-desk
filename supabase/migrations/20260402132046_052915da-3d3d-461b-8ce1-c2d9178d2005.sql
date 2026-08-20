
-- Pitch notes table
CREATE TABLE public.pitch_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pitch_id UUID NOT NULL REFERENCES public.pitches(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  logged_by TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.pitch_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read pitch notes"
ON public.pitch_notes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert pitch notes"
ON public.pitch_notes FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can delete pitch notes"
ON public.pitch_notes FOR DELETE TO authenticated USING (true);

-- Pitch documents table
CREATE TABLE public.pitch_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pitch_id UUID NOT NULL REFERENCES public.pitches(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  content_type TEXT,
  uploaded_by TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.pitch_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read pitch documents"
ON public.pitch_documents FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert pitch documents"
ON public.pitch_documents FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can delete pitch documents"
ON public.pitch_documents FOR DELETE TO authenticated USING (true);

-- Storage bucket for pitch documents
INSERT INTO storage.buckets (id, name, public) VALUES ('pitch-documents', 'pitch-documents', true);

CREATE POLICY "Authenticated users can upload pitch documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'pitch-documents');

CREATE POLICY "Anyone can view pitch documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'pitch-documents');

CREATE POLICY "Authenticated users can delete pitch documents"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'pitch-documents');
