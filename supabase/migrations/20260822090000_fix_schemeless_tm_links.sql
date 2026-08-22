-- Repair Transfermarkt links stored without a scheme.
--
-- One was saved as `transfermarkt.com.br/gabriel/profil/spieler/435338`. As an
-- href a browser reads that as a relative path, so "open on Transfermarkt" went
-- to the app's own 404 wearing a convincing address; and the enrichment
-- function's `^https?://` pattern rejected it as invalid before making a single
-- request, which surfaced as Transfermarkt having no page.
--
-- The application now normalises on save and on render, so new rows are clean.
-- This fixes the ones already in the table — otherwise every one of them keeps
-- failing exactly as before and the fix looks like it did nothing.
--
-- Only rows that plainly name transfermarkt are touched, and the `://` guard
-- means running this twice changes nothing.

UPDATE public.scouted_targets
SET tm_link = 'https://' || tm_link
WHERE tm_link IS NOT NULL
  AND tm_link <> ''
  AND tm_link NOT LIKE '%://%'
  AND tm_link ILIKE '%transfermarkt.%';

-- Same shape, same problem: a valuation link pasted without a scheme points at
-- the app rather than out of it.
UPDATE public.scouted_targets
SET valuation_url = 'https://' || valuation_url
WHERE valuation_url IS NOT NULL
  AND valuation_url <> ''
  AND valuation_url NOT LIKE '%://%'
  AND valuation_url LIKE '%.%';

-- Clear the stale failure so the roster stops showing an error for a link that
-- is now correct. Enrichment re-runs on demand and will set it again if it
-- genuinely still fails — this only removes a message that is no longer true.
UPDATE public.scouted_targets
SET tm_status = 'pending', tm_fail_reason = NULL
WHERE tm_status = 'failed'
  AND tm_fail_reason ILIKE '%invalid_url%';
