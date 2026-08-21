-- A club's need outlives the person who mentioned it.
--
-- `club_requirements` was built hanging off a contact: NOT NULL, ON DELETE
-- CASCADE. That models the wrong thing three ways.
--
--   * Palmeiras still need a left back after their sporting director leaves.
--     Under the old shape, deleting that contact deleted the need with him.
--   * Two people at one club describing the same gap made two requirements,
--     and matching would have shown the same shortlist twice.
--   * A need could not be recorded for a club we hold nobody at — which is
--     exactly the club worth tracking, because the gap in the network is the
--     thing the desk exists to close.
--
-- So the club owns the need and the contact records who told us. Attribution
-- is worth keeping — "who said this, and when" is half of whether you believe
-- it — but it is not the owner.

ALTER TABLE public.club_requirements
  ADD COLUMN IF NOT EXISTS club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE;

-- Backfill from the contact's club. `contacts.club` is a name, not a foreign
-- key — the whole app joins the two by name — so this is an exact-name match
-- and rows that do not resolve keep their attribution and no club. Nothing
-- writes this table yet, so in practice there is nothing to move; written out
-- because "the table is empty" is a fact about today, not about the migration.
UPDATE public.club_requirements r
SET club_id = c.id
FROM public.contacts ct
JOIN public.clubs c ON c.name = ct.club
WHERE r.contact_id = ct.id
  AND r.club_id IS NULL;

-- The contact becomes attribution: optional, and it survives the person being
-- removed rather than taking the need with it.
ALTER TABLE public.club_requirements
  DROP CONSTRAINT IF EXISTS club_requirements_contact_id_fkey;

ALTER TABLE public.club_requirements
  ALTER COLUMN contact_id DROP NOT NULL;

ALTER TABLE public.club_requirements
  ADD CONSTRAINT club_requirements_contact_id_fkey
  FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;

-- A need with neither a club nor a source is not a need, it is a stray row.
-- Same shape as buy_pitches_has_a_counterparty.
ALTER TABLE public.club_requirements
  DROP CONSTRAINT IF EXISTS club_requirements_has_an_owner;

ALTER TABLE public.club_requirements
  ADD CONSTRAINT club_requirements_has_an_owner
  CHECK (club_id IS NOT NULL OR contact_id IS NOT NULL);

-- The needs list reads "open requirements, by club". The existing partial
-- index covers "open, by position" for matching; this one covers the page.
CREATE INDEX IF NOT EXISTS idx_club_requirements_club_open
  ON public.club_requirements (club_id)
  WHERE status = 'open';

COMMENT ON COLUMN public.club_requirements.club_id IS
  'Whose need this is. The club, not the person who happened to mention it.';
COMMENT ON COLUMN public.club_requirements.contact_id IS
  'Who told us, and therefore who to go back to. Null once that person is gone.';
