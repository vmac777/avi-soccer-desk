-- Drop old constraint first
ALTER TABLE public.contacts DROP CONSTRAINT contacts_stage_check;

-- Migrate existing data while no constraint exists
UPDATE public.contacts SET stage = 'Contacted' WHERE stage = 'Contacted - Not Interested';

-- Add updated constraint
ALTER TABLE public.contacts ADD CONSTRAINT contacts_stage_check CHECK (stage = ANY (ARRAY[''::text, 'Contacted - No Answer'::text, 'Contacted'::text, 'Offered'::text, 'Negotiating'::text, 'Closed Won'::text, 'Closed Lost'::text, 'Dormant'::text]));
