
-- Update check constraint to allow empty string
ALTER TABLE public.contacts DROP CONSTRAINT contacts_stage_check;
ALTER TABLE public.contacts ADD CONSTRAINT contacts_stage_check 
  CHECK (stage = ANY (ARRAY[''::text, 'Contacted - No Answer'::text, 'Contacted - Not Interested'::text, 'Offered'::text, 'Negotiating'::text, 'Closed Won'::text, 'Closed Lost'::text, 'Dormant'::text]));

-- Set default to blank
ALTER TABLE public.contacts ALTER COLUMN stage SET DEFAULT '';

-- Reset contacts that were bulk-migrated from Lead and never actually contacted
UPDATE public.contacts SET stage = '' WHERE stage = 'Contacted - No Answer' AND (last_contact IS NULL OR last_contact = '2026-03-30');
