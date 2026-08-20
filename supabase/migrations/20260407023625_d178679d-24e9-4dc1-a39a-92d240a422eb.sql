
-- Drop old stage check constraint
ALTER TABLE public.contacts DROP CONSTRAINT contacts_stage_check;

-- Migrate existing Lead contacts BEFORE adding new constraint
UPDATE public.contacts SET stage = 'Contacted - No Answer' WHERE stage = 'Lead';

-- Add new stage check constraint
ALTER TABLE public.contacts ADD CONSTRAINT contacts_stage_check 
  CHECK (stage = ANY (ARRAY['Contacted - No Answer'::text, 'Contacted - Not Interested'::text, 'Offered'::text, 'Negotiating'::text, 'Closed Won'::text, 'Closed Lost'::text, 'Dormant'::text]));

-- Update default value for stage column
ALTER TABLE public.contacts ALTER COLUMN stage SET DEFAULT 'Contacted - No Answer';

-- Add is_primary column
ALTER TABLE public.contacts ADD COLUMN is_primary boolean NOT NULL DEFAULT false;
