ALTER TABLE public.market_briefs
ADD COLUMN IF NOT EXISTS comparable_positions text[] NOT NULL DEFAULT '{}'::text[];