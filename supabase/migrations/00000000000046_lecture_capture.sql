-- Lecture capture, import-only (docs/LECTURE_CAPTURE_SPEC.md, ruling 2026-08-24:
-- in-app recording FAILED the Expo Go probe -- suspension at lock destroys the file --
-- and waits for the Phase 4 dev client). This is the storage + transcript half; the
-- Deepgram submit/callback pair lives in lecture-transcribe / lecture-transcript-webhook.

-- Bucket: migration 11's exact pattern -- private, owner-prefix, signed URLs only.
-- 200 MB: a 2-hour lecture at 128 kbps is ~115 MB (spec's own math).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('lectures', 'lectures', false, 209715200,
   array['audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/aac'])
on conflict (id) do nothing;

create policy lectures_all_own on storage.objects
  for all to authenticated
  using (bucket_id = 'lectures' and (select auth.uid())::text = (storage.foldername(name))[1])
  with check (bucket_id = 'lectures' and (select auth.uid())::text = (storage.foldername(name))[1]);

create table public.lecture_transcripts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id bigint not null references public.courses (id) on delete cascade,
  -- THE source anchor (spec Fork 3): the local calendar date the lecture happened.
  -- Supplied by the user at import (the file's mtime is when Voice Memos exported it,
  -- not when the professor spoke) -- B4's never-derive-from-UTC rule applies.
  lecture_date date not null,
  storage_path text not null,
  status text not null default 'processing'
    check (status in ('processing', 'ready', 'failed')),
  failure_reason text,
  transcript text,
  -- Word/paragraph timestamps from Deepgram, for "check the actual material" jumps.
  segments jsonb,
  deepgram_request_id text,
  -- Possession of this token IS the webhook's auth (whoop-webhook's shape adapted:
  -- Deepgram callbacks carry no HMAC, so the unguessable callback URL carries the
  -- secret instead). Per-row and single-purpose; visible only to the owning user
  -- under RLS, which is the same trust boundary as the transcript itself.
  webhook_token text not null unique,
  -- Raw audio is the user's property: deletable by them once status='ready', never
  -- auto-deleted (spec's retention rule). The flag records that the path is gone.
  audio_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lecture_transcripts_user_course_idx
  on public.lecture_transcripts (user_id, course_id, lecture_date desc);

create trigger lecture_transcripts_set_updated_at
  before update on public.lecture_transcripts
  for each row execute function public.set_updated_at();

alter table public.lecture_transcripts enable row level security;
alter table public.lecture_transcripts force row level security;

create policy lecture_transcripts_all_own on public.lecture_transcripts
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

comment on table public.lecture_transcripts is
  'Imported lecture audio -> Deepgram transcript, per course, anchored by lecture_date. '
  'lecture-transcribe submits; lecture-transcript-webhook (token-authed callback) stores '
  'the result. Transcript permanent; audio user-deletable once ready.';
