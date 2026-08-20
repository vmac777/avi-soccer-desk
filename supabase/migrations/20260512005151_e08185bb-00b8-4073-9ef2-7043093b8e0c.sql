-- Restrictive admin-only policies on storage.objects for the pitch-documents bucket
CREATE POLICY "pitch_documents_storage_select_admin"
ON storage.objects AS RESTRICTIVE
FOR SELECT TO authenticated
USING (bucket_id <> 'pitch-documents' OR public.is_admin());

CREATE POLICY "pitch_documents_storage_insert_admin"
ON storage.objects AS RESTRICTIVE
FOR INSERT TO authenticated
WITH CHECK (bucket_id <> 'pitch-documents' OR public.is_admin());

CREATE POLICY "pitch_documents_storage_update_admin"
ON storage.objects AS RESTRICTIVE
FOR UPDATE TO authenticated
USING (bucket_id <> 'pitch-documents' OR public.is_admin())
WITH CHECK (bucket_id <> 'pitch-documents' OR public.is_admin());

CREATE POLICY "pitch_documents_storage_delete_admin"
ON storage.objects AS RESTRICTIVE
FOR DELETE TO authenticated
USING (bucket_id <> 'pitch-documents' OR public.is_admin());