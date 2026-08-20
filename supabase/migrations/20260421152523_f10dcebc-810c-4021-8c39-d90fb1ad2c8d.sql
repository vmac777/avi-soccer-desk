-- Replace admin-only write policy on club_sources with authenticated write
DROP POLICY IF EXISTS club_sources_admin_write ON public.club_sources;

CREATE POLICY club_sources_authenticated_insert
ON public.club_sources
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY club_sources_authenticated_update
ON public.club_sources
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY club_sources_authenticated_delete
ON public.club_sources
FOR DELETE
TO authenticated
USING (true);