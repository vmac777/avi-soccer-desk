CREATE OR REPLACE FUNCTION public.bulk_import_club_sources(
  p_sources jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_caller_role text;
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_src jsonb;
BEGIN
  SELECT role INTO v_caller_role FROM profiles WHERE id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Only admins may import sources' USING ERRCODE = '42501';
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
$$;

-- Add unique constraint to prevent duplicate sources per club
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'club_sources_club_url_unique'
      AND conrelid = 'public.club_sources'::regclass
  ) THEN
    ALTER TABLE public.club_sources
      ADD CONSTRAINT club_sources_club_url_unique UNIQUE (club_id, url);
  END IF;
END$$;

REVOKE ALL ON FUNCTION public.bulk_import_club_sources(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_import_club_sources(jsonb) TO authenticated;