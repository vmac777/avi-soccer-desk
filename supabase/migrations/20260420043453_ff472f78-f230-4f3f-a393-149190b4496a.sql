-- View: news_items_with_clubs (security_invoker so RLS applies through the view)
CREATE OR REPLACE VIEW public.news_items_with_clubs WITH (security_invoker=true) AS
SELECT
  ni.id, ni.url, ni.blurb, ni.urgency, ni.created_at, ni.submitted_by, ni.deleted_at,
  array_remove(array_agg(DISTINCT c.id), NULL) as club_ids,
  array_remove(array_agg(DISTINCT c.league), NULL) as leagues,
  COALESCE(
    jsonb_agg(DISTINCT jsonb_build_object('id', c.id, 'name', c.name, 'league', c.league))
      FILTER (WHERE c.id IS NOT NULL),
    '[]'::jsonb
  ) as clubs_json
FROM public.news_items ni
LEFT JOIN public.news_items_clubs nic ON nic.news_item_id = ni.id
LEFT JOIN public.clubs c ON c.id = nic.club_id
WHERE ni.deleted_at IS NULL
GROUP BY ni.id;

GRANT SELECT ON public.news_items_with_clubs TO authenticated;

-- Admin-only RPC for per-club news badge counts
CREATE OR REPLACE FUNCTION public.club_news_counts(p_league text DEFAULT NULL)
RETURNS TABLE(club_id uuid, unread_urgent integer, total_relevant integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Admin only' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    c.id as club_id,
    COUNT(DISTINCT ni.id) FILTER (
      WHERE ni.urgency IN ('urgent', 'super_urgent')
        AND ni.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM news_reads nr
          WHERE nr.news_item_id = ni.id AND nr.user_id = auth.uid()
        )
    )::integer as unread_urgent,
    COUNT(DISTINCT ni.id) FILTER (
      WHERE ni.urgency = 'relevant' AND ni.deleted_at IS NULL
    )::integer as total_relevant
  FROM clubs c
  LEFT JOIN news_items_clubs nic ON nic.club_id = c.id
  LEFT JOIN news_items ni ON ni.id = nic.news_item_id
  WHERE (p_league IS NULL OR c.league = p_league)
  GROUP BY c.id
  HAVING COUNT(DISTINCT ni.id) FILTER (WHERE ni.deleted_at IS NULL) > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.club_news_counts(text) TO authenticated;