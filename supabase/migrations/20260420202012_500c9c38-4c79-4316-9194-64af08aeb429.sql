
-- 1. Helper: is_super_admin()
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  );
$$;

-- 2. Update is_admin() so super_admin counts as admin (preserves all existing admin powers)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
  );
$$;

-- 3. Lock down system_health to super_admin only
CREATE OR REPLACE FUNCTION public.system_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super admin only';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'last_digest_sent_at', (
        SELECT MAX(digest_emailed_at) FROM public.news_items WHERE digest_emailed_at IS NOT NULL
      ),
      'last_super_urgent_sent_at', (
        SELECT MAX(super_urgent_emailed_at) FROM public.news_items WHERE super_urgent_emailed_at IS NOT NULL
      ),
      'pending_digest_count', (
        SELECT count(*) FROM public.news_items
        WHERE urgency = 'urgent' AND digest_emailed_at IS NULL AND deleted_at IS NULL
      ),
      'pending_super_urgent_count', (
        SELECT count(*) FROM public.news_items
        WHERE urgency = 'super_urgent'
          AND super_urgent_emailed_at IS NULL
          AND deleted_at IS NULL
      ),
      'failures_last_24h', (
        SELECT count(*) FROM public.email_failures
        WHERE resolved_at IS NULL AND attempted_at >= now() - interval '24 hours'
      ),
      'submissions_last_hour', (
        SELECT COALESCE(jsonb_object_agg(p.full_name, jsonb_build_object(
          'total', user_counts.total,
          'super_urgent', user_counts.super_urgent
        )), '{}'::jsonb)
        FROM (
          SELECT submitted_by,
                 count(*) AS total,
                 count(*) FILTER (WHERE urgency = 'super_urgent') AS super_urgent
          FROM public.news_items
          WHERE created_at >= now() - interval '1 hour' AND deleted_at IS NULL
          GROUP BY submitted_by
        ) user_counts
        JOIN public.profiles p ON p.id = user_counts.submitted_by
      ),
      'unresolved_failures', (
        SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
        FROM (
          SELECT ef.id, ef.news_item_id, ef.email_type, ef.error_message,
                 ef.attempted_at, ef.retry_count
          FROM public.email_failures ef
          WHERE ef.resolved_at IS NULL
          ORDER BY ef.attempted_at DESC
          LIMIT 20
        ) t
      )
    )
  );
END;
$$;

-- 4. Lock down audit_summary_week to super_admin only
CREATE OR REPLACE FUNCTION public.audit_summary_week()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super admin only';
  END IF;

  RETURN (
    WITH week_items AS (
      SELECT ni.*, p.full_name AS submitter_name
      FROM public.news_items ni
      LEFT JOIN public.profiles p ON p.id = ni.submitted_by
      WHERE ni.created_at >= now() - interval '7 days'
        AND ni.deleted_at IS NULL
    )
    SELECT jsonb_build_object(
      'total', (SELECT count(*) FROM week_items),
      'by_urgency', (
        SELECT COALESCE(jsonb_object_agg(urgency, cnt), '{}'::jsonb)
        FROM (SELECT urgency, count(*) AS cnt FROM week_items GROUP BY urgency) t
      ),
      'top_submitter', (
        SELECT jsonb_build_object('name', submitter_name, 'count', cnt)
        FROM (
          SELECT submitter_name, count(*) AS cnt FROM week_items
          GROUP BY submitter_name ORDER BY cnt DESC LIMIT 1
        ) t
      ),
      'top_clubs', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('name', name, 'count', cnt)), '[]'::jsonb)
        FROM (
          SELECT c.name, count(*) AS cnt
          FROM week_items wi
          JOIN public.news_items_clubs nic ON nic.news_item_id = wi.id
          JOIN public.clubs c ON c.id = nic.club_id
          GROUP BY c.name
          ORDER BY cnt DESC
          LIMIT 5
        ) t
      )
    )
  );
END;
$$;

-- 5. Update news_items SELECT RLS: only super_admins see deleted items
DROP POLICY IF EXISTS news_items_select ON public.news_items;
CREATE POLICY news_items_select
ON public.news_items
FOR SELECT
TO authenticated
USING (deleted_at IS NULL OR public.is_super_admin());

-- 6. news_items_audit table: restrict to super_admin (audit page)
DROP POLICY IF EXISTS news_items_audit_admin_read ON public.news_items_audit;
CREATE POLICY news_items_audit_super_admin_read
ON public.news_items_audit
FOR SELECT
TO authenticated
USING (public.is_super_admin());
