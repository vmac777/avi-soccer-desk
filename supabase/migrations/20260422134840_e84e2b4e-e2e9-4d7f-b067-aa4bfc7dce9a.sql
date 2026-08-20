CREATE OR REPLACE FUNCTION public.submit_news_item(p_url text, p_blurb text, p_urgency text, p_club_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_news_item_id uuid;
  v_duplicate_of uuid;
  v_current_minute timestamptz;
  v_minute_count integer;
  v_hour_super_count integer;
  v_club_count integer;
  v_created_at timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id) THEN
    RAISE EXCEPTION 'Your account is not fully configured. Contact an admin to complete setup.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT role INTO v_role FROM profiles WHERE id = v_user_id;
  IF v_role NOT IN ('admin', 'intern', 'super_admin') THEN
    RAISE EXCEPTION 'Role not authorized to submit news' USING ERRCODE = '42501';
  END IF;

  IF p_url IS NULL OR p_url !~ '^https?://' THEN
    RAISE EXCEPTION 'URL must start with http:// or https://' USING ERRCODE = '22023';
  END IF;
  IF p_blurb IS NULL OR char_length(trim(p_blurb)) = 0 THEN
    RAISE EXCEPTION 'Blurb cannot be empty' USING ERRCODE = '22023';
  END IF;
  IF char_length(p_blurb) > 300 THEN
    RAISE EXCEPTION 'Blurb must be 300 characters or fewer' USING ERRCODE = '22023';
  END IF;
  IF p_urgency NOT IN ('relevant', 'urgent', 'super_urgent') THEN
    RAISE EXCEPTION 'Invalid urgency value' USING ERRCODE = '22023';
  END IF;
  IF p_club_ids IS NULL OR array_length(p_club_ids, 1) = 0 THEN
    RAISE EXCEPTION 'At least one club must be tagged' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_club_count FROM clubs WHERE id = ANY(p_club_ids);
  IF v_club_count <> array_length(p_club_ids, 1) THEN
    RAISE EXCEPTION 'One or more club IDs are invalid' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(submission_count), 0) INTO v_minute_count
  FROM submission_rate_limits
  WHERE user_id = v_user_id
    AND window_start >= now() - interval '1 minute';
  IF v_minute_count >= 5 THEN
    RAISE EXCEPTION 'Rate limit: max 5 submissions per minute. Try again in 60 seconds.' USING ERRCODE = '54000';
  END IF;

  IF p_urgency = 'super_urgent' THEN
    SELECT COALESCE(SUM(super_urgent_count), 0) INTO v_hour_super_count
    FROM submission_rate_limits
    WHERE user_id = v_user_id
      AND window_start >= now() - interval '1 hour';
    IF v_hour_super_count >= 3 THEN
      RAISE EXCEPTION 'Rate limit: max 3 super urgent submissions per hour.' USING ERRCODE = '54000';
    END IF;
  END IF;

  v_current_minute := date_trunc('minute', now());

  SELECT id INTO v_duplicate_of
  FROM news_items
  WHERE url = p_url AND deleted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  INSERT INTO news_items (url, blurb, urgency, submitted_by)
  VALUES (p_url, trim(p_blurb), p_urgency, v_user_id)
  RETURNING id, created_at INTO v_news_item_id, v_created_at;

  INSERT INTO news_items_clubs (news_item_id, club_id)
  SELECT v_news_item_id, unnest(p_club_ids);

  INSERT INTO submission_rate_limits (user_id, window_start, submission_count, super_urgent_count)
  VALUES (
    v_user_id,
    v_current_minute,
    1,
    CASE WHEN p_urgency = 'super_urgent' THEN 1 ELSE 0 END
  )
  ON CONFLICT (user_id, window_start) DO UPDATE SET
    submission_count = submission_rate_limits.submission_count + 1,
    super_urgent_count = submission_rate_limits.super_urgent_count +
      CASE WHEN p_urgency = 'super_urgent' THEN 1 ELSE 0 END;

  RETURN jsonb_build_object(
    'news_item_id', v_news_item_id,
    'urgency', p_urgency,
    'duplicate_of', v_duplicate_of,
    'trigger_super_urgent_email', p_urgency = 'super_urgent',
    'created_at', v_created_at
  );
END;
$function$;