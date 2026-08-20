-- 1. club_sources: add restrictive admin-only policies for write operations
CREATE POLICY "restrict_club_sources_insert_admin"
ON public.club_sources AS RESTRICTIVE
FOR INSERT TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY "restrict_club_sources_update_admin"
ON public.club_sources AS RESTRICTIVE
FOR UPDATE TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "restrict_club_sources_delete_admin"
ON public.club_sources AS RESTRICTIVE
FOR DELETE TO authenticated
USING (public.is_admin());

-- 2. tr_competition_players_cache: rebind policy from public -> authenticated
DROP POLICY IF EXISTS "admin_all" ON public.tr_competition_players_cache;
CREATE POLICY "tr_competition_players_cache_admin_all"
ON public.tr_competition_players_cache
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 3. tr_competition_players_history: rebind policy from public -> authenticated
DROP POLICY IF EXISTS "admin_all" ON public.tr_competition_players_history;
CREATE POLICY "tr_competition_players_history_admin_all"
ON public.tr_competition_players_history
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());