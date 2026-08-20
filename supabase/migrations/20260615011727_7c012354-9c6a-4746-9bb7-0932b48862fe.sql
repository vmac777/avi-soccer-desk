
CREATE POLICY "pitch-attachments authenticated read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'pitch-attachments');

CREATE POLICY "pitch-attachments authenticated insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pitch-attachments');

CREATE POLICY "pitch-attachments authenticated update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'pitch-attachments')
  WITH CHECK (bucket_id = 'pitch-attachments');

CREATE POLICY "pitch-attachments authenticated delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'pitch-attachments');
