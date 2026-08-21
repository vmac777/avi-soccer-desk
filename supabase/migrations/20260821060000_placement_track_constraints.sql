-- Let the three-sided model actually be written.
--
-- The previous migration renamed club_track to selling_track and widened every
-- vocabulary, but the CHECK constraints came along for the ride unchanged. So
-- the database still only accepted the buying-desk's values:
--
--   ball_in_court  us | them            — rejecting selling, buying, player
--   selling_track  none | enquiring | bid_in | fee_agreed
--                                       — rejecting enquired, price_set, refused
--   player_track   none | talking | agreed
--                                       — rejecting willing, declined
--
-- The UI painted the change optimistically, Postgres refused it, and the
-- rollback put the old value back — which reads as a button that does nothing
-- rather than as an error. Every chip outside those old lists was dead.
--
-- 'them' is kept as an accepted value for ball_in_court only so a row written
-- between the two migrations is not stranded; nothing writes it any more.

ALTER TABLE public.buy_pitches DROP CONSTRAINT IF EXISTS buy_pitches_ball_in_court_check;
ALTER TABLE public.buy_pitches
  ADD CONSTRAINT buy_pitches_ball_in_court_check
  CHECK (ball_in_court IS NULL OR ball_in_court IN ('us', 'selling', 'buying', 'player', 'them'));

ALTER TABLE public.buy_pitches DROP CONSTRAINT IF EXISTS buy_pitches_club_track_check;
ALTER TABLE public.buy_pitches DROP CONSTRAINT IF EXISTS buy_pitches_selling_track_check;
ALTER TABLE public.buy_pitches
  ADD CONSTRAINT buy_pitches_selling_track_check
  CHECK (selling_track IN ('none', 'enquired', 'enquiring', 'price_set', 'bid_in', 'fee_agreed', 'refused'));

ALTER TABLE public.buy_pitches DROP CONSTRAINT IF EXISTS buy_pitches_buying_track_check;
ALTER TABLE public.buy_pitches
  ADD CONSTRAINT buy_pitches_buying_track_check
  CHECK (buying_track IN ('none', 'sounded_out', 'interested', 'bid_made', 'terms_offered', 'terms_agreed', 'passed'));

ALTER TABLE public.buy_pitches DROP CONSTRAINT IF EXISTS buy_pitches_player_track_check;
ALTER TABLE public.buy_pitches
  ADD CONSTRAINT buy_pitches_player_track_check
  CHECK (player_track IN ('none', 'talking', 'willing', 'agreed', 'declined'));

-- 'enquiring' above is the old selling value, kept for the same reason as
-- 'them': rows written before the rename should still satisfy the constraint.
UPDATE public.buy_pitches SET selling_track = 'enquired' WHERE selling_track = 'enquiring';

ALTER TABLE public.buy_negotiation_entries DROP CONSTRAINT IF EXISTS buy_negotiation_entries_side_check;
ALTER TABLE public.buy_negotiation_entries
  ADD CONSTRAINT buy_negotiation_entries_side_check
  CHECK (side IN ('selling', 'buying', 'player', 'internal'));
