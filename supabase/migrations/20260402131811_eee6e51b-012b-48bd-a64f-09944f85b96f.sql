
UPDATE public.pitches SET stage = 'Contacted' WHERE stage = 'Identified';
UPDATE public.pitches SET stage = 'Materials Sent' WHERE stage = 'Offered';
UPDATE public.pitches SET stage = 'Negotiating' WHERE stage = 'In Negotiation';
UPDATE public.pitches SET stage = 'Done Deal' WHERE stage = 'Closed (Won)';
UPDATE public.pitches SET stage = 'Not Interested' WHERE stage = 'Closed (Lost)';
UPDATE public.pitches SET stage = 'Withdrawn' WHERE stage = 'Closed (Withdrawn)';
