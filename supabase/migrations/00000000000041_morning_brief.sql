-- Tier 4's last item: the morning brief (BLUEPRINT 11.2, "Anthropic API expansions") --
-- three lines on the Start Day surface stitching the day's signals into English.
--
-- Cached on the day's own row, generated at most once per local day: the brief describes
-- a morning, and a screen re-render must never mean another paid model call. Source is
-- recorded so the UI can be honest about which kind of sentence it is showing -- the
-- deterministic brief is a real brief (nightly-analysis' own rule), not an error state.

alter table public.days
  add column morning_brief text,
  add column morning_brief_source text
    check (morning_brief_source is null or morning_brief_source in ('model', 'deterministic')),
  add column morning_brief_generated_at timestamptz;

comment on column public.days.morning_brief is
  'Three-line morning note, generated once per local day by the morning-brief function. '
  'Deterministic-first: always a real brief, model-enriched when budget and key allow.';
