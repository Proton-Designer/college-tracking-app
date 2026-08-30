-- Allocation check-ins -- the storage behind Signal:Noise's coverage axis.
--
-- Ported from LifeOS (`checkins` + `checkin_allocations`), authored fresh per D42. The engine that
-- reads these lives in packages/core/src/signal/allocation.ts and was ported first; this is the
-- table it reads.
--
-- **D33, as amended by the owner, is why this schema looks the way it does.** Three properties,
-- each load-bearing:
--
--  1. **There is no `wasted` column.** Unaccounted time is `window length - sum(allocations)`,
--     derived on read. That single choice is what makes "no operation can take minutes from another
--     domain" fall out of the model, and it is why unaccounted time cannot be hidden by editing a
--     number.
--
--  2. **A window with no row means UNKNOWN, not wasted.** Nothing writes a row to mark a window
--     missed, so silence is never converted into a measurement. Deriving `wasted` from silence
--     would let the app invent the very number the person is supposed to confess.
--
--  3. **`answered_at` distinguishes a confession from a pre-fill.** A window may be pre-filled only
--     from evidence that already carries its own account of the time -- a completed Hour has a
--     deliverable and a domain. Everything else is asked about explicitly. Coverage counts
--     confessions and evidence, never inferences.

-- ============================================================================
-- 1. The window
-- ============================================================================

create table public.allocation_checkins (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  -- The window this answer accounts for. Real instants rather than a slot index: the window length
  -- is a per-user setting (profiles.checkin_interval_minutes) that can change, and a stored index
  -- would silently re-point at different time after such a change.
  window_start timestamptz not null,
  window_end timestamptz not null,
  -- NULL while a window is open. Set when a person answers, which is what makes a confession
  -- distinguishable from a pre-fill (see source below).
  answered_at timestamptz,
  -- 'user' for an answer a person gave; anything else names the evidence that pre-filled it, so
  -- the UI can say WHY a window is accounted for rather than just that it is.
  source text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint allocation_checkins_window_ordered check (window_end > window_start),
  constraint allocation_checkins_one_per_window unique (user_id, window_start)
);

create index allocation_checkins_user_date_idx
  on public.allocation_checkins (user_id, local_date desc);

create trigger allocation_checkins_set_updated_at
  before update on public.allocation_checkins
  for each row execute function public.set_updated_at();

alter table public.allocation_checkins enable row level security;
alter table public.allocation_checkins force row level security;

create policy allocation_checkins_all_own on public.allocation_checkins
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

comment on table public.allocation_checkins is
  'One row per ANSWERED or PRE-FILLED allocation window. A window with no row is unknown, never '
  'wasted -- nothing writes a row to mark a window missed, so silence is never converted into a '
  'measurement (D33).';

-- ============================================================================
-- 2. The allocation
-- ============================================================================

create table public.checkin_allocations (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  checkin_id bigint not null references public.allocation_checkins (id) on delete cascade,
  domain public.life_domain not null,
  minutes smallint not null check (minutes > 0),
  created_at timestamptz not null default now(),
  -- One row per domain per window. Two rows for the same domain would be two opinions about the
  -- same block of time.
  constraint checkin_allocations_one_per_domain unique (checkin_id, domain)
);

create index checkin_allocations_checkin_idx on public.checkin_allocations (checkin_id);

alter table public.checkin_allocations enable row level security;
alter table public.checkin_allocations force row level security;

create policy checkin_allocations_all_own on public.checkin_allocations
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- A zero-minute allocation is not stored: `minutes > 0` means "this domain got none of this window"
-- is represented by the row's absence, which is both smaller and unambiguous. The sum of what IS
-- here, subtracted from the window length, is the unaccounted remainder -- see the engine.
comment on table public.checkin_allocations is
  'Minutes assigned to each domain within one window. No wasted row exists: unaccounted time is '
  'window length minus the sum of these, derived on read, so it cannot be edited away.';
