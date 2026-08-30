-- M5 -- the global distraction layer, alongside the per-Hour one rather than replacing it.
--
-- Our six-cause chips inside an Hour stay exactly as they are: they feed the Pareto chart and the
-- friction analytics, and `task_sessions.interruptions` keeps being maintained by trigger. What
-- LifeOS adds is capture OUTSIDE a session -- a named trigger you recognise in yourself, tapped
-- whenever it happens -- plus the versioned action plans already added in migration 53.
--
-- Two columns and one trigger fix.

-- ============================================================================
-- 1. A distraction no longer requires an Hour
-- ============================================================================

-- Nullable because the global counter's whole point is that it works when nothing is running. The
-- column stays a real FK when it is set, so an in-Hour tap is unchanged.
alter table public.distractions
  alter column session_id drop not null;

-- Which named trigger this tap was, when the user picked one. Nullable: a tap with a cause and no
-- trigger is still a real observation, and requiring a trigger would make the fast path slower than
-- the thing it is trying to capture.
alter table public.distractions
  add column trigger_id bigint references public.distraction_triggers (id) on delete set null;

create index distractions_trigger_idx on public.distractions (trigger_id);

-- The local day a global tap belongs to. In-Hour taps get their day from the session; a tap with no
-- session has no other way to be placed on a day, and deriving one from the timestamp at read time
-- would put it in a UTC day (B4).
alter table public.distractions
  add column local_date date;

create index distractions_user_local_date_idx on public.distractions (user_id, local_date);

-- ============================================================================
-- 2. The counter trigger must survive a NULL session
-- ============================================================================

-- Before this migration `target` could not be null, so the UPDATE always addressed exactly one row.
-- With global taps, `coalesce(new.session_id, old.session_id)` is null for every global capture, and
-- `where id = null` matches nothing -- which is harmless but only by accident. Making it explicit
-- means the next reader does not have to work out whether a global tap silently zeroed a counter.
--
-- The count subquery is likewise now explicitly session-scoped: without the null guard,
-- `d.session_id = target` with a null target would count zero rows and write 0 over a real
-- interruption count if the outer WHERE ever did match.
create or replace function public.distractions_sync_counter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target bigint;
begin
  target := coalesce(new.session_id, old.session_id);

  -- A global tap belongs to no session and changes no session's counter.
  if target is null then
    return null;
  end if;

  update public.task_sessions
    set interruptions = (
      select count(*)
      from public.distractions d
      where d.session_id = target
    )
    where id = target;

  return null;
end;
$$;

comment on table public.distractions is
  'One +1 Distraction tap. session_id is set for a tap inside an Hour (and keeps '
  'task_sessions.interruptions in sync by trigger -- never write that column directly) and NULL for '
  'a global capture, which carries local_date instead. trigger_id names the pattern when the user '
  'picked one.';

comment on column public.distractions.local_date is
  'Set on global captures only; an in-Hour tap takes its day from the session. Supplied by the '
  'caller, which already computed it through localDateFromInstant -- never derived from the '
  'timestamp at read time, which would land it in a UTC day (B4).';
