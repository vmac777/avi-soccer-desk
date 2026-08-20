ALTER TABLE public.scouted_targets
  ADD COLUMN league text DEFAULT '' NOT NULL,
  ADD COLUMN tm_link text DEFAULT '' NOT NULL,
  ADD COLUMN has_valuation boolean DEFAULT false NOT NULL,
  ADD COLUMN valuation_url text DEFAULT '' NOT NULL;