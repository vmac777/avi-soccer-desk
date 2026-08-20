ALTER TABLE public.buy_pitches
  ADD COLUMN ball_in_court text
    CHECK (ball_in_court IN ('us','them')),
  ADD COLUMN club_track text NOT NULL DEFAULT 'none'
    CHECK (club_track IN ('none','enquiring','bid_in','fee_agreed')),
  ADD COLUMN player_track text NOT NULL DEFAULT 'none'
    CHECK (player_track IN ('none','talking','agreed')),
  ADD COLUMN loss_reason text
    CHECK (loss_reason IN ('walked','rejected','lost','collapsed')),
  ADD COLUMN mwp numeric,
  ADD COLUMN milestones jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.buy_pitches
  ADD CONSTRAINT buy_pitches_one_per_target UNIQUE (scouted_target_id);