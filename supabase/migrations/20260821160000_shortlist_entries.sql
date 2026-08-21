-- The four names you actually put in front of the club.
--
-- Matching produces a ranked list of everyone on the roster who fits. That is
-- not a shortlist. A shortlist is what the agent decided to send after reading
-- it — usually shorter, sometimes in a different order, and carrying a line
-- per player that no score can generate ("plays the same system Abel wants",
-- "his agent is a friend"). The ranking is an input to that judgement, not a
-- replacement for it.
--
-- It is also the record. "We showed Palmeiras these four on 12 August" is the
-- thing you need when they come back in January, and it is the thing a live
-- recomputation destroys.

CREATE TABLE IF NOT EXISTS public.shortlist_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  requirement_id uuid NOT NULL
    REFERENCES public.club_requirements(id) ON DELETE CASCADE,
  scouted_target_id uuid NOT NULL
    REFERENCES public.scouted_targets(id) ON DELETE CASCADE,

  -- The agent's order, which is not the score's order.
  rank integer NOT NULL DEFAULT 0,
  -- Why him, in words. The part of a shortlist that persuades anybody.
  note text,

  -- The score when he was added, not recomputed on read. A sheet handed over
  -- in August should still say what it said in August after his xTV moves;
  -- otherwise the record quietly rewrites itself.
  match_score integer,

  status text NOT NULL DEFAULT 'shortlisted',

  -- Stamped when the sheet goes out, which is what turns a working list into
  -- a dated record of what the club was shown.
  presented_at timestamptz,

  -- The bridge into the negotiation. Set when a shortlisted player becomes a
  -- pitch, so the two stop being separate accounts of the same conversation.
  -- ON DELETE SET NULL: deleting a pitch should not delete the fact that we
  -- put him forward.
  buy_pitch_id uuid REFERENCES public.buy_pitches(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),

  CONSTRAINT shortlist_entries_status_chk
    CHECK (status IN ('shortlisted', 'presented', 'interested', 'passed', 'pitched')),

  -- One row per player per need. Putting the same man forward twice for the
  -- same gap is a mistake, not an intention.
  CONSTRAINT shortlist_entries_one_per_player UNIQUE (requirement_id, scouted_target_id)
);

-- The detail page reads one requirement's list in the agent's order.
CREATE INDEX IF NOT EXISTS idx_shortlist_entries_requirement
  ON public.shortlist_entries (requirement_id, rank);

-- "Where else have we put this player forward?" — the roster page's question.
CREATE INDEX IF NOT EXISTS idx_shortlist_entries_player
  ON public.shortlist_entries (scouted_target_id);

ALTER TABLE public.shortlist_entries ENABLE ROW LEVEL SECURITY;

-- Same shape as club_requirements, which this is a child of. Two sibling
-- tables with different policy shapes is how a gap gets missed.
DROP POLICY IF EXISTS shortlist_entries_admin_all ON public.shortlist_entries;
CREATE POLICY shortlist_entries_admin_all ON public.shortlist_entries
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shortlist_entries TO authenticated;
GRANT ALL ON public.shortlist_entries TO service_role;

COMMENT ON TABLE public.shortlist_entries IS
  'Players put forward for a club requirement. Curated by the agent from the '
  'match ranking, not generated from it.';
