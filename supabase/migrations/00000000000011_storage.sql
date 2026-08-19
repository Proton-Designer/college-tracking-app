-- Storage buckets referenced by the schema: syllabus_uploads.storage_path (syllabi),
-- tasks.proof_of_work_content (proof), and profile images (avatars). All private --
-- objects are read through signed URLs, never public buckets. Every object path is
-- prefixed with the owning user's id (`<user_id>/<filename>`), and RLS on
-- storage.objects enforces that prefix matches the caller.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('syllabi', 'syllabi', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg']),
  ('proof', 'proof', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg']),
  ('avatars', 'avatars', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy syllabi_all_own on storage.objects
  for all to authenticated
  using (bucket_id = 'syllabi' and (select auth.uid())::text = (storage.foldername(name))[1])
  with check (bucket_id = 'syllabi' and (select auth.uid())::text = (storage.foldername(name))[1]);

create policy proof_all_own on storage.objects
  for all to authenticated
  using (bucket_id = 'proof' and (select auth.uid())::text = (storage.foldername(name))[1])
  with check (bucket_id = 'proof' and (select auth.uid())::text = (storage.foldername(name))[1]);

create policy avatars_all_own on storage.objects
  for all to authenticated
  using (bucket_id = 'avatars' and (select auth.uid())::text = (storage.foldername(name))[1])
  with check (bucket_id = 'avatars' and (select auth.uid())::text = (storage.foldername(name))[1]);
