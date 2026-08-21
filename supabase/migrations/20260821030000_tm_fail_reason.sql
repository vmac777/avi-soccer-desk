-- Why Transfermarkt enrichment gave up on a player.
--
-- The mirror of tr_fail_reason. A dead link, a blocked request and a page that
-- parsed to nothing need different fixes — a corrected URL, a wait, a parser
-- change — and "Couldn't fetch from TM" distinguishes none of them.
--
-- Values come from the tm-fetch response: invalid_url, blocked, http_error 404,
-- parse_failed, and so on.

ALTER TABLE public.scouted_targets
  ADD COLUMN IF NOT EXISTS tm_fail_reason text;

COMMENT ON COLUMN public.scouted_targets.tm_fail_reason IS
  'Reason returned by tm-fetch when tm_status is failed. Cleared on success.';
