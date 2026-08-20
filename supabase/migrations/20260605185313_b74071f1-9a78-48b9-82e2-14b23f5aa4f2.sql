
-- 1. Restrict bulk_import_club_sources to admins only
CREATE OR REPLACE FUNCTION public.bulk_import_club_sources(p_sources jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
DECLARE
  v_caller_role text;
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_src jsonb;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Not authorized to import sources' USING ERRCODE = '42501';
  END IF;

  FOR v_src IN SELECT * FROM jsonb_array_elements(p_sources)
  LOOP
    BEGIN
      INSERT INTO club_sources (club_id, url, label, created_by)
      VALUES (
        (v_src->>'club_id')::uuid,
        v_src->>'url',
        v_src->>'label',
        auth.uid()
      );
      v_inserted := v_inserted + 1;
    EXCEPTION
      WHEN unique_violation THEN
        v_skipped := v_skipped + 1;
      WHEN OTHERS THEN
        v_errors := v_errors || jsonb_build_object(
          'url', v_src->>'url',
          'error', SQLERRM
        );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'skipped', v_skipped,
    'errors', v_errors
  );
END;
$function$;

-- 2. Add restrictive admin-only SELECT policy on club_sources
CREATE POLICY "restrict_club_sources_select_admin"
  ON public.club_sources
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (is_admin());

-- 3. Tighten shared-briefs storage bucket: admin-only INSERT + UPDATE
DROP POLICY IF EXISTS "Authenticated users can upload to shared-briefs" ON storage.objects;

CREATE POLICY "Admins can upload to shared-briefs"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'shared-briefs' AND public.is_admin());

CREATE POLICY "Admins can update shared-briefs"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'shared-briefs' AND public.is_admin())
  WITH CHECK (bucket_id = 'shared-briefs' AND public.is_admin());
