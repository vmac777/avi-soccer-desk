CREATE OR REPLACE FUNCTION public.league_news_counts_for_user()
RETURNS TABLE (
  league text,
  unread_count integer,
  max_urgency text
)
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'admin_only';
  END IF;

  RETURN QUERY
  WITH user_unread AS (
    SELECT n.id, n.urgency, c.league
    FROM news_items n
    JOIN news_items_clubs nic ON nic.news_item_id = n.id
    JOIN clubs c ON c.id = nic.club_id
    WHERE n.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM news_reads nr
        WHERE nr.news_item_id = n.id AND nr.user_id = auth.uid()
      )
  ),
  per_league AS (
    SELECT
      uu.league,
      count(DISTINCT uu.id)::integer AS unread_count,
      CASE
        WHEN bool_or(uu.urgency = 'super_urgent') THEN 'super_urgent'
        WHEN bool_or(uu.urgency = 'urgent') THEN 'urgent'
        WHEN bool_or(uu.urgency = 'relevant') THEN 'relevant'
        ELSE NULL
      END AS max_urgency
    FROM user_unread uu
    GROUP BY uu.league
  )
  SELECT
    DISTINCT c.league,
    COALESCE(pl.unread_count, 0) AS unread_count,
    pl.max_urgency
  FROM clubs c
  LEFT JOIN per_league pl ON pl.league = c.league
  WHERE c.league IS NOT NULL
  ORDER BY c.league;
END;
$$;

CREATE OR REPLACE FUNCTION public.club_news_counts_for_user(p_league text)
RETURNS TABLE (
  club_id uuid,
  club_name text,
  unread_count integer,
  max_urgency text
)
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'admin_only';
  END IF;

  RETURN QUERY
  WITH user_unread AS (
    SELECT n.id, n.urgency, c.id AS club_id, c.name AS club_name
    FROM news_items n
    JOIN news_items_clubs nic ON nic.news_item_id = n.id
    JOIN clubs c ON c.id = nic.club_id
    WHERE n.deleted_at IS NULL
      AND c.league = p_league
      AND NOT EXISTS (
        SELECT 1 FROM news_reads nr
        WHERE nr.news_item_id = n.id AND nr.user_id = auth.uid()
      )
  ),
  per_club AS (
    SELECT
      uu.club_id,
      uu.club_name,
      count(DISTINCT uu.id)::integer AS unread_count,
      CASE
        WHEN bool_or(uu.urgency = 'super_urgent') THEN 'super_urgent'
        WHEN bool_or(uu.urgency = 'urgent') THEN 'urgent'
        WHEN bool_or(uu.urgency = 'relevant') THEN 'relevant'
        ELSE NULL
      END AS max_urgency
    FROM user_unread uu
    GROUP BY uu.club_id, uu.club_name
  )
  SELECT
    c.id AS club_id,
    c.name AS club_name,
    COALESCE(pc.unread_count, 0) AS unread_count,
    pc.max_urgency
  FROM clubs c
  LEFT JOIN per_club pc ON pc.club_id = c.id
  WHERE c.league = p_league
  ORDER BY c.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.league_news_counts_for_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.club_news_counts_for_user(text) TO authenticated;