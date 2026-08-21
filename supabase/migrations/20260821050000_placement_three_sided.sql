-- A placement has three counterparties, and the agency is the only one who sees
-- all three.
--
-- This table was built for a buying club: `club_track` was the fee negotiation
-- with the selling club, `player_track` was personal terms with the player.
-- An agency holds the mandate and works three parties who do not talk to each
-- other directly — the selling club has to release him, the buying club has to
-- want him and pay, and the player has to want to go. Any one of them can end
-- it, and each ends it for a different reason.
--
-- `club_track` always meant "the other club", and its values are already a
-- selling-side ladder, so it is renamed rather than replaced.
--
-- NOTE: renaming a live column breaks a running older build. Deploy this
-- migration and the frontend together.

ALTER TABLE public.buy_pitches RENAME COLUMN club_track TO selling_track;

ALTER TABLE public.buy_pitches
  ADD COLUMN IF NOT EXISTS buying_track text NOT NULL DEFAULT 'none';

-- Personal terms. These belong to the buying side: the fee is between the
-- clubs, the wage is between the club and the player.
ALTER TABLE public.buy_pitches
  ADD COLUMN IF NOT EXISTS salary_offer   numeric,   -- annual, EUR
  ADD COLUMN IF NOT EXISTS contract_years integer,
  ADD COLUMN IF NOT EXISTS signing_bonus  numeric,
  ADD COLUMN IF NOT EXISTS deadline       date;

-- Ball in court was us | them. With three counterparties "them" says nothing.
-- Everything currently marked 'them' was the selling club, because under the
-- buying-desk model that was the only counterparty a pitch had.
UPDATE public.buy_pitches SET ball_in_court = 'selling' WHERE ball_in_court = 'them';

COMMENT ON COLUMN public.buy_pitches.selling_track IS
  'none | enquired | price_set | bid_in | fee_agreed | refused';
COMMENT ON COLUMN public.buy_pitches.buying_track IS
  'none | sounded_out | interested | bid_made | terms_offered | terms_agreed | passed';
COMMENT ON COLUMN public.buy_pitches.player_track IS
  'none | talking | willing | agreed | declined — does he want the move';
COMMENT ON COLUMN public.buy_pitches.ball_in_court IS
  'us | selling | buying | player — who the deal is waiting on';
COMMENT ON COLUMN public.buy_pitches.mwp IS
  'Target fee: our read on where this lands. Was max-willingness-to-pay under the buying-desk model.';
COMMENT ON COLUMN public.buy_pitches.deadline IS
  'Window close, or the club''s own cutoff. Deadline pressure is what moves these.';

-- The log becomes three conversations rather than one transcript.
ALTER TABLE public.buy_negotiation_entries
  ADD COLUMN IF NOT EXISTS side text NOT NULL DEFAULT 'selling';

COMMENT ON COLUMN public.buy_negotiation_entries.side IS
  'selling | buying | player | internal. Existing rows are selling — that is what they were.';

-- An agent's working queue is "what is waiting on me", and it is read far more
-- often than anything else on this table.
CREATE INDEX IF NOT EXISTS idx_buy_pitches_ball_in_court
  ON public.buy_pitches (ball_in_court)
  WHERE ball_in_court IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_buy_negotiation_entries_side
  ON public.buy_negotiation_entries (buy_pitch_id, side);
