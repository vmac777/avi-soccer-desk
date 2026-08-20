-- Ensure extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- =========================================================
-- claim_digest_items: atomic claim of pending urgent items
-- =========================================================
CREATE OR REPLACE FUNCTION public.claim_digest_items()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_items jsonb;
BEGIN
  -- Guard: only admins or the service role (auth.uid() IS NULL) may claim.
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden: only admins or the service role may claim digest items';
  END IF;

  WITH claimed AS (
    SELECT id FROM public.news_items
    WHERE urgency = 'urgent'
      AND digest_emailed_at IS NULL
      AND deleted_at IS NULL
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE public.news_items ni
    SET digest_emailed_at = now()
    FROM claimed
    WHERE ni.id = claimed.id
    RETURNING ni.*
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', u.id,
        'url', u.url,
        'blurb', u.blurb,
        'urgency', u.urgency,
        'created_at', u.created_at,
        'submitter_name', p.full_name,
        'clubs', (
          SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) ORDER BY c.name)
          FROM public.news_items_clubs nic
          JOIN public.clubs c ON c.id = nic.club_id
          WHERE nic.news_item_id = u.id
        )
      )
      ORDER BY u.created_at
    ),
    '[]'::jsonb
  ) INTO v_items
  FROM updated u
  LEFT JOIN public.profiles p ON p.id = u.submitted_by;

  RETURN v_items;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_digest_items() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_digest_items() TO service_role, authenticated;

-- =========================================================
-- get_stuck_super_urgents
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_stuck_super_urgents()
RETURNS TABLE(
  id uuid,
  url text,
  blurb text,
  created_at timestamptz,
  submitted_by uuid,
  submitter_name text,
  clubs jsonb
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  SELECT
    ni.id, ni.url, ni.blurb, ni.created_at, ni.submitted_by,
    p.full_name AS submitter_name,
    (
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) ORDER BY c.name)
      FROM public.news_items_clubs nic
      JOIN public.clubs c ON c.id = nic.club_id
      WHERE nic.news_item_id = ni.id
    ) AS clubs
  FROM public.news_items ni
  LEFT JOIN public.profiles p ON p.id = ni.submitted_by
  WHERE ni.urgency = 'super_urgent'
    AND ni.super_urgent_emailed_at IS NULL
    AND ni.deleted_at IS NULL
    AND (ni.last_email_attempt_at IS NULL
         OR ni.last_email_attempt_at < now() - interval '5 minutes')
    AND (
      SELECT COUNT(*) FROM public.email_failures ef
      WHERE ef.news_item_id = ni.id AND ef.email_type = 'super_urgent'
    ) < 6;
END;
$$;

REVOKE ALL ON FUNCTION public.get_stuck_super_urgents() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_stuck_super_urgents() TO service_role, authenticated;

-- =========================================================
-- audit_summary_week
-- =========================================================
CREATE OR REPLACE FUNCTION public.audit_summary_week()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
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

REVOKE ALL ON FUNCTION public.audit_summary_week() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_summary_week() TO authenticated;

-- =========================================================
-- system_health
-- =========================================================
CREATE OR REPLACE FUNCTION public.system_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin only';
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

REVOKE ALL ON FUNCTION public.system_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.system_health() TO authenticated;

-- =========================================================
-- Schedule cron jobs (using Vault helpers)
-- =========================================================

-- Unschedule any existing jobs with these names (idempotent)
DO $$
DECLARE j record;
BEGIN
  FOR j IN SELECT jobname FROM cron.job
    WHERE jobname IN ('daily-news-digest','digest-retry','retry-super-urgent','cleanup-rate-limits')
  LOOP
    PERFORM cron.unschedule(j.jobname);
  END LOOP;
END $$;

-- 1. Daily digest at 10 AM BRT (13:00 UTC)
SELECT cron.schedule(
  'daily-news-digest',
  '0 13 * * *',
  $cron$
  SELECT net.http_post(
    url := public.get_app_base_url() || '/functions/v1/send-daily-digest',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || public.get_service_role_key(),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $cron$
);

-- 2. Digest retry every 15 minutes
SELECT cron.schedule(
  'digest-retry',
  '*/15 * * * *',
  $cron$
  SELECT net.http_post(
    url := public.get_app_base_url() || '/functions/v1/send-daily-digest-retry',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || public.get_service_role_key(),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $cron$
);

-- 3. Retry super urgent every 5 minutes
SELECT cron.schedule(
  'retry-super-urgent',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := public.get_app_base_url() || '/functions/v1/retry-super-urgent',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || public.get_service_role_key(),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $cron$
);

-- 4. Cleanup rate limits hourly
SELECT cron.schedule(
  'cleanup-rate-limits',
  '0 * * * *',
  $cron$
  DELETE FROM public.submission_rate_limits
  WHERE window_start < now() - interval '2 days';
  $cron$
);