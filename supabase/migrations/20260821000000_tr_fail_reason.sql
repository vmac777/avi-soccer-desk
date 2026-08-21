-- Why TransferRoom enrichment gave up on a player.
--
-- `tr_status` only ever says 'failed', which sends whoever is looking at it to
-- the edge-function logs to find out whether the club is unmapped, the name did
-- not match, or the credentials are wrong. Those need completely different
-- fixes, and across ninety-five players the answer is usually the same for all
-- of them — so record it on the row and say it on the card.
--
-- Values come from the function's own `reason` field: club_not_in_clubs_table,
-- club_not_mapped_to_tr, no_match, team_not_in_competition_pool, proxy_401,
-- proxy_not_configured, and so on.

ALTER TABLE public.scouted_targets
  ADD COLUMN IF NOT EXISTS tr_fail_reason text;

COMMENT ON COLUMN public.scouted_targets.tr_fail_reason IS
  'Reason returned by scouted-target-enrich-tr when tr_status is failed. Cleared on success.';
