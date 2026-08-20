
-- 1. Make pitch-documents bucket private
UPDATE storage.buckets SET public = false WHERE id = 'pitch-documents';

-- 2. Drop the overly permissive public SELECT policy
DROP POLICY IF EXISTS "Anyone can view pitch documents" ON storage.objects;

-- 3. Add authenticated-only SELECT policy
CREATE POLICY "Authenticated users can view pitch documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'pitch-documents');

-- 4. Add missing UPDATE policy
CREATE POLICY "Authenticated users can update pitch documents"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'pitch-documents');

-- 5. Fix contacts_enriched view to use SECURITY INVOKER
DROP VIEW IF EXISTS public.contacts_enriched;

CREATE VIEW public.contacts_enriched
WITH (security_invoker = true) AS
SELECT
  c.*,
  CASE
    WHEN c.last_contact IS NULL THEN NULL
    ELSE (CURRENT_DATE - c.last_contact)
  END AS days_since_contact,
  COALESCE(i.interaction_count, 0) AS interaction_count,
  CASE
    WHEN c.last_contact IS NULL THEN 'unknown'
    WHEN (CURRENT_DATE - c.last_contact) <= 7 THEN 'active'
    WHEN (CURRENT_DATE - c.last_contact) <= 14 THEN 'recent'
    WHEN (CURRENT_DATE - c.last_contact) <= 30 THEN 'cooling'
    ELSE 'stale'
  END AS health_status
FROM public.contacts c
LEFT JOIN (
  SELECT contact_id, COUNT(*) AS interaction_count
  FROM public.interactions
  GROUP BY contact_id
) i ON i.contact_id = c.id;
