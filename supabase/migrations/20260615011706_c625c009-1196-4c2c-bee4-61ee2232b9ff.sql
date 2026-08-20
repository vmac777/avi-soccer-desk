
-- 1. Remove Approval stage: migrate existing rows to Enquiry
UPDATE public.buy_pitches SET stage = 'Enquiry' WHERE stage = 'Approval';

-- 2. Negotiation type + loan trigger value
ALTER TABLE public.buy_pitches
  ADD COLUMN IF NOT EXISTS negotiation_type text,
  ADD COLUMN IF NOT EXISTS loan_trigger_value numeric;

-- 3. Attachments on notes
ALTER TABLE public.buy_pitch_notes
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
