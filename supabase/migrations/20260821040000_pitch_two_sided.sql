-- A placement has two sides, and the agency sits between them.
--
-- This table came from a buying desk: one club, buying one player, and
-- `contact_id` meant the club being bought from. An agency's deal is not shaped
-- like that. It represents the player, and the work runs in two directions at
-- once — persuading a buying club to want him, and getting the selling club to
-- let him go. Either conversation can start first and either can be the one
-- that stalls.
--
-- So `contact_id` keeps its meaning as the selling side and `buying_contact_id`
-- is added alongside it. Both are optional individually because real deals
-- start one-sided: a free agent has no selling club at all, and an approach
-- often begins with a buying club before the current club knows anything about
-- it. What is not allowed is a pitch with neither.

ALTER TABLE public.buy_pitches
  ADD COLUMN IF NOT EXISTS buying_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL;

-- Was NOT NULL under the buying-desk model, where a selling club was the only
-- counterparty there could be.
ALTER TABLE public.buy_pitches
  ALTER COLUMN contact_id DROP NOT NULL;

ALTER TABLE public.buy_pitches
  DROP CONSTRAINT IF EXISTS buy_pitches_has_a_counterparty;

ALTER TABLE public.buy_pitches
  ADD CONSTRAINT buy_pitches_has_a_counterparty
  CHECK (contact_id IS NOT NULL OR buying_contact_id IS NOT NULL);

-- The old uniqueness was one row per (player, selling contact). With a second
-- side that is wrong twice over: the same player is offered to many buying
-- clubs from the same selling club, and a NULL selling side no longer collides
-- the way SQL uniqueness treats NULLs. Uniqueness now covers the pair, so the
-- same player can be worked with any number of counterparties and the same
-- three-way conversation cannot be opened twice.
ALTER TABLE public.buy_pitches
  DROP CONSTRAINT IF EXISTS buy_pitches_one_per_target_per_contact;

CREATE UNIQUE INDEX IF NOT EXISTS buy_pitches_one_per_pairing
  ON public.buy_pitches (
    scouted_target_id,
    COALESCE(contact_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(buying_contact_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

COMMENT ON COLUMN public.buy_pitches.contact_id IS
  'Selling side — the club the player is registered with. Null for a free agent.';
COMMENT ON COLUMN public.buy_pitches.buying_contact_id IS
  'Buying side — the club being approached. Null before anyone has been sounded out.';

CREATE INDEX IF NOT EXISTS idx_buy_pitches_buying_contact
  ON public.buy_pitches (buying_contact_id)
  WHERE buying_contact_id IS NOT NULL;
