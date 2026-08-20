ALTER TABLE public.pitches 
  ADD COLUMN asking_price NUMERIC NULL,
  ADD COLUMN current_offer NUMERIC NULL,
  ADD COLUMN final_price NUMERIC NULL,
  ADD COLUMN npv_profit NUMERIC NULL;