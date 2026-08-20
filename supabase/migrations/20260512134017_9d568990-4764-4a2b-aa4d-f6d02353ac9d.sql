insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'shared-briefs',
  'shared-briefs',
  true,
  5242880,
  array['text/html']
)
on conflict (id) do nothing;

create policy "Public read access for shared-briefs"
  on storage.objects for select
  using (bucket_id = 'shared-briefs');

create policy "Authenticated users can upload to shared-briefs"
  on storage.objects for insert
  with check (bucket_id = 'shared-briefs' and auth.role() = 'authenticated');

create policy "No deletes on shared-briefs"
  on storage.objects for delete
  using (false);