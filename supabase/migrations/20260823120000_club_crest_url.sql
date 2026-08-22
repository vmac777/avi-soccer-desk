-- Somewhere to put a club's crest.
--
-- The board leads with the clubs that are asking for players, and a wall of
-- three-letter initials discs reads as a spreadsheet. Most crests can be
-- derived from the Transfermarkt club id the app already ships in
-- `t1_club_tm_lookup.json`, so this column is the override rather than the
-- source: it exists for the clubs that lookup does not cover, and for the
-- cases where the derived image is wrong.
--
-- Null is the normal state. A club with no crest renders the initials disc,
-- which is a designed fallback rather than a hole.

ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS crest_url text;

-- Same guard the news sources carry, and for the same reason: a URL stored
-- without a scheme is read by the browser as a relative path, so the image
-- silently resolves against our own origin and 404s.
ALTER TABLE public.clubs
  DROP CONSTRAINT IF EXISTS clubs_crest_url_format;
ALTER TABLE public.clubs
  ADD CONSTRAINT clubs_crest_url_format
  CHECK (crest_url IS NULL OR crest_url ~ '^https?://');
