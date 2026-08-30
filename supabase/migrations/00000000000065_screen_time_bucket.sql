-- A dedicated bucket for weekly Screen Time screenshots.
--
-- WHY THIS EXISTS RATHER THAN REUSING `syllabi`. The screenshots were initially written into the
-- `syllabi` bucket because it was the only private, user-prefixed, image-accepting bucket in the
-- project. That works, and it is wrong for two reasons worth stating: an account export would hand
-- someone a file list where their screen time is labelled as coursework, and any future policy
-- change scoped to academic uploads would silently reach data that is not academic. A bucket is
-- part of the schema, not an implementation detail of whoever uploaded first.
--
-- The path stays FLAT -- `<uid>/screen-time-<week>.png`, never a `screen-time/` subfolder --
-- because `deleteAccount.ts` enumerates each bucket with a NON-RECURSIVE `list(userId)`. A
-- subfolder would list as one directory entry, `remove()` would not delete its contents, and the
-- files would survive an account deletion. Found by the engineer who chose the flat path rather
-- than discovered later, and recorded here because the constraint lives in TypeScript while the
-- thing it constrains is this bucket.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'screen-time',
  'screen-time',
  false,
  -- A phone screenshot. 10MB is generous for a PNG and small enough that a mistaken upload of
  -- something else fails at the boundary rather than in the parser.
  10485760,
  array['image/png', 'image/jpeg']
)
on conflict (id) do nothing;

-- Owner-prefixed, matching every other private bucket in this project: the first path segment must
-- be the caller's own uid.
create policy screen_time_objects_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'screen-time' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy screen_time_objects_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'screen-time' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy screen_time_objects_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'screen-time' and (storage.foldername(name))[1] = (select auth.uid())::text);
