CREATE OR REPLACE VIEW public.contacts_enriched
WITH (security_invoker = true)
AS
SELECT
  c.*,
  CASE WHEN c.last_contact IS NULL THEN NULL
       ELSE (CURRENT_DATE - c.last_contact)::int
  END AS days_since_contact,
  CASE
    WHEN c.last_contact IS NULL THEN 'unknown'::text
    WHEN (CURRENT_DATE - c.last_contact) < 27 THEN 'active'::text
    WHEN (CURRENT_DATE - c.last_contact) <= 90 THEN 'recent'::text
    ELSE 'stale'::text
  END AS health_status,
  COALESCE((SELECT count(*) FROM public.interactions i WHERE i.contact_id = c.id), 0) AS interaction_count
FROM public.contacts c;