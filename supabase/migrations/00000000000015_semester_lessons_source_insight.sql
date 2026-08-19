-- L8: traces a durable lesson back to the insight that produced it.
--
-- Without this, semester_lessons had no way to answer "what made you believe this?"
-- (SCREEN_SPEC §6: "a claim without evidence is not displayed" -- a durable lesson is
-- the most load-bearing claim in the product, since it shapes every future nightly
-- call's cached context, and it was the one unsourced claim left in the schema).
--
-- Also makes the retrospective's promotion idempotent by a real query instead of a
-- string-matching hack: re-running the retrospective and re-promoting the same insight
-- inserts another row (semester_lessons stays append-only -- a re-confirmation across
-- retrospectives is genuine signal, not noise), and loadDurableProfile dedupes at READ
-- time to the most recent row per source_insight_id, so the same lesson never appears
-- twice in the cached system prompt -- repetition in a prompt functions as emphasis,
-- and duplicate-by-rerun is a process artifact, not evidence strength.
--
-- Nullable: manually-written lessons, or any lesson from before this migration, have no
-- source insight and pass through loadDurableProfile's dedupe unchanged (no key to
-- collide on).
alter table public.semester_lessons
  add column source_insight_id bigint references public.insights (id) on delete set null;

create index semester_lessons_source_insight_id_idx on public.semester_lessons (source_insight_id);
