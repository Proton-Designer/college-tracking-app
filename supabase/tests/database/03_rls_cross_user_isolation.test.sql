-- Proves user A cannot read ANY of user B's rows, iterating over every user-scoped
-- table rather than spot-checking a handful. Two phases:
--   1. Seed one representative row per table for two users (as postgres, bypassing RLS --
--      this is setup, not what's under test).
--   2. Generically enumerate every RLS-enabled table with a user_id (or profiles.id)
--      column and, running AS each user via `set role authenticated`, prove (a) the
--      user sees exactly their own row(s) and (b) an explicit query for the other
--      user's id returns zero rows.
begin;
select no_plan();

-- ============================================================================
-- Phase 1: seed fixture (as postgres -- bypasses RLS, this is setup)
--
-- Deliberately hand-written per table, unlike phase 2's assertion loop below (which
-- IS dynamically enumerated from pg_class/information_schema). Adding a new
-- user_id-scoped table requires adding an insert here, or its "user sees their own
-- row(s)" assertion fails against zero seeded rows -- confirmed live when migration
-- 0016 added `interventions` without a corresponding insert (2 failing assertions,
-- immediately obvious which table and why).
--
-- This is intentional, not a gap to close: making the seeder dynamic would mean
-- inferring required columns and FK ordering per table, and a seeder that GUESSES at a
-- valid row would produce fixtures that don't represent real data -- worse than a loud,
-- self-announcing failure that tells you exactly which table needs a seed row. You will
-- hit this again in L10 when integrations add tables; that's the property working as
-- intended, not a bug in the test.
-- ============================================================================
create or replace function pg_temp.seed_fixture(p_user_id uuid, p_email text)
returns void
language plpgsql
as $$
declare
  v_course_id bigint;
  v_category_id bigint;
  v_grade_item_id bigint;
  v_deliverable_id bigint;
  v_backplan_id bigint;
  v_upload_id bigint;
  v_task_id bigint;
  v_kill_habit_id bigint;
  v_experiment_id bigint;
  v_insight_id bigint;
  v_agent_report_id bigint;
  v_feed_id bigint;
begin
  insert into auth.users (id, email) values (p_user_id, p_email);
  -- profiles row is auto-created by the on_auth_user_created trigger.

  insert into public.courses (user_id, code, name, term)
    values (p_user_id, 'BME 301', 'Biomedical Instrumentation', 'Fall 2026')
    returning id into v_course_id;

  insert into public.course_meetings (user_id, course_id, day_of_week, start_time, end_time)
    values (p_user_id, v_course_id, 1, '10:30', '11:20');

  insert into public.course_office_hours (user_id, course_id, day_of_week, start_time, end_time)
    values (p_user_id, v_course_id, 2, '14:00', '16:00');

  insert into public.grade_boundaries (user_id, course_id, letter, min_pct)
    values (p_user_id, v_course_id, 'A', 93);

  insert into public.grade_categories (user_id, course_id, name, weight_pct, drop_lowest_n, expected_item_count)
    values (p_user_id, v_course_id, 'Homework', 20, 1, 5)
    returning id into v_category_id;

  insert into public.grade_items (user_id, course_id, category_id, name, points_earned, points_possible)
    values (p_user_id, v_course_id, v_category_id, 'HW1', 8, 10)
    returning id into v_grade_item_id;

  insert into public.deliverables (user_id, course_id, grade_item_id, title, type, due_at, estimated_minutes)
    values (p_user_id, v_course_id, v_grade_item_id, 'HW1', 'problem_set', now() + interval '3 days', 90)
    returning id into v_deliverable_id;

  insert into public.deliverable_backplans (user_id, deliverable_id, target_completion_date)
    values (p_user_id, v_deliverable_id, current_date + 2)
    returning id into v_backplan_id;

  insert into public.backplan_milestones (user_id, backplan_id, phase, milestone_date, minutes)
    values (p_user_id, v_backplan_id, 'attempt', current_date + 1, 45);

  insert into public.syllabus_uploads (user_id, course_id, file_name, storage_path)
    values (p_user_id, v_course_id, 'syllabus.pdf', 'syllabi/' || p_user_id || '/syllabus.pdf')
    returning id into v_upload_id;

  insert into public.syllabus_extractions (user_id, upload_id, item_type, extracted_payload, extraction_confidence, source_snippet)
    values (p_user_id, v_upload_id, 'assignment', '{"title":"HW1"}'::jsonb, 0.9, 'HW1 due Friday');

  insert into public.tasks (user_id, course_id, deliverable_id, title, category, planned_date)
    values (p_user_id, v_course_id, v_deliverable_id, 'Finish HW1', 'problem_set', current_date)
    returning id into v_task_id;

  insert into public.task_sessions (user_id, task_id, planned_start, planned_duration_min)
    values (p_user_id, v_task_id, now(), 60);

  insert into public.daily_checkins (user_id, local_date, energy, mood)
    values (p_user_id, current_date, 7, 6);

  insert into public.daily_predictions (user_id, local_date, predicted_completion_pct, hardest_task_id)
    values (p_user_id, current_date, 70, v_task_id);

  insert into public.daily_reviews (user_id, local_date, mits_planned, mits_completed)
    values (p_user_id, current_date, 3, 2);

  insert into public.kill_habits (user_id, name)
    values (p_user_id, 'Instagram relapse')
    returning id into v_kill_habit_id;

  insert into public.kill_events (user_id, kill_habit_id, outcome)
    values (p_user_id, v_kill_habit_id, 'resisted');

  insert into public.commitment_escalation_events (user_id, kill_habit_id, from_level, to_level)
    values (p_user_id, v_kill_habit_id, 'l0_reminder', 'l1_stronger_notification');

  insert into public.interventions (user_id, kind, trigger_reason, message, actions, related_task_id, related_kill_habit_id)
    values (p_user_id, 'deviation_prompt', 'BME block hasn''t started', 'BME block hasn''t started.',
      array['Forgot', 'Avoiding', 'Schedule changed', 'Start now'], v_task_id, v_kill_habit_id);

  insert into public.friction_logs (user_id, related_task_id, cause)
    values (p_user_id, v_task_id, 'distracted');

  insert into public.decision_journal (user_id, decision, prediction_pct)
    values (p_user_id, 'Study tomorrow morning instead', 80);

  insert into public.journal_entries (user_id, local_date, entry_type, content)
    values (p_user_id, current_date, 'night', 'Rough day but got the essentials done.');

  insert into public.telemetry_events (user_id, source, type, metric, value)
    values (p_user_id, 'whoop', 'sleep', 'sleep_duration', 6.8);

  insert into public.health_daily (user_id, local_date, sleep_hours, whoop_recovery_pct)
    values (p_user_id, current_date, 6.8, 58);

  insert into public.screen_daily (user_id, local_date, total_screen_min)
    values (p_user_id, current_date, 190);

  insert into public.app_usage (user_id, local_date, app_name, minutes)
    values (p_user_id, current_date, 'Instagram', 22);

  insert into public.calendar_events (user_id, title, start_at, end_at, course_id)
    values (p_user_id, 'BME lecture', now(), now() + interval '50 minutes', v_course_id);

  insert into public.daily_summaries (user_id, local_date, summary)
    values (p_user_id, current_date, '{"headline":"ok day"}'::jsonb);

  insert into public.weekly_summaries (user_id, week_start_date, summary)
    values (p_user_id, date_trunc('week', current_date)::date, '{}'::jsonb);

  insert into public.monthly_summaries (user_id, month_start_date, summary)
    values (p_user_id, date_trunc('month', current_date)::date, '{}'::jsonb);

  insert into public.agent_reports (user_id, local_date, report_type, payload, model)
    values (p_user_id, current_date, 'nightly', '{"headline":"ok"}'::jsonb, 'claude-sonnet-5')
    returning id into v_agent_report_id;

  insert into public.semester_lessons (user_id, term, lesson, source_report_id)
    values (p_user_id, 'Fall 2026', 'Front-load reading before exam week.', v_agent_report_id);

  insert into public.insights (user_id, claim, confidence_stored, sample_size)
    values (p_user_id, 'Late study sessions run short.', 'testing', 4)
    returning id into v_insight_id;

  insert into public.experiments (user_id, insight_id, hypothesis, start_date)
    values (p_user_id, v_insight_id, 'No caffeine after 1pm improves sleep onset.', current_date)
    returning id into v_experiment_id;

  insert into public.experiment_measurements (user_id, experiment_id, local_date, metric, value)
    values (p_user_id, v_experiment_id, current_date, 'sleep_onset_min', 22);

  insert into public.risk_snapshots (user_id, scope, course_id, snapshot_date, score, band, trace, confidence)
    values (p_user_id, 'course', v_course_id, current_date, 62, 'high', '[]'::jsonb, 'moderate');

  insert into public.grade_snapshots (user_id, course_id, snapshot_date, current_grade, category_results)
    values (p_user_id, v_course_id, current_date, 87.5, '[]'::jsonb);

  insert into public.llm_usage_log (user_id, call_type, model, cost_usd, success)
    values (p_user_id, 'nightly_analysis', 'claude-sonnet-5', 0.03, true);

  perform private.store_oauth_token(p_user_id, 'whoop', 'sk-fixture-token-' || p_user_id::text);

  select private.store_brightspace_feed_url(p_user_id, 'https://purdue.example/feed/' || p_user_id || '.ics')
    into v_feed_id;

  insert into public.ics_event_extractions (user_id, feed_id, external_id, summary, start_at, end_at)
    values (p_user_id, v_feed_id, 'fixture-event-1@brightspace', 'BME 301 Lecture', now(), now() + interval '50 minutes');
end;
$$;

select pg_temp.seed_fixture('30000000-0000-0000-0000-0000000000a1', 'user-a@test.local');
select pg_temp.seed_fixture('30000000-0000-0000-0000-0000000000b2', 'user-b@test.local');

-- ============================================================================
-- Phase 2: generic verification, run AS user A
-- ============================================================================
create or replace function pg_temp.check_isolation(p_self uuid, p_other uuid)
returns setof text
language plpgsql
as $$
declare
  r record;
  visible_own bigint;
  visible_other bigint;
begin
  for r in
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relrowsecurity = true
      and exists (
        select 1 from information_schema.columns col
        where col.table_schema = 'public' and col.table_name = c.relname and col.column_name = 'user_id'
      )
    order by c.relname
  loop
    execute format('select count(*) from public.%I where user_id = $1', r.table_name)
      into visible_own using p_self;
    return next ok(visible_own >= 1, format('%s: user can see their own row(s)', r.table_name));

    execute format('select count(*) from public.%I where user_id = $1', r.table_name)
      into visible_other using p_other;
    return next is(visible_other, 0::bigint, format('%s: user sees ZERO rows filtered to the other user''s id', r.table_name));

    execute format('select count(*) from public.%I', r.table_name) into visible_own;
    execute format('select count(*) from public.%I where user_id = $1', r.table_name)
      into visible_other using p_self;
    return next is(visible_own, visible_other, format('%s: an unfiltered select returns only the caller''s own rows', r.table_name));
  end loop;
end;
$$;

set role authenticated;
set request.jwt.claims = '{"sub":"30000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select * from pg_temp.check_isolation('30000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000b2');
reset role;

set role authenticated;
set request.jwt.claims = '{"sub":"30000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
select * from pg_temp.check_isolation('30000000-0000-0000-0000-0000000000b2', '30000000-0000-0000-0000-0000000000a1');
reset role;

-- profiles uses `id` as both PK and the RLS key, not `user_id` -- covered separately.
set role authenticated;
set request.jwt.claims = '{"sub":"30000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select is(
  (select count(*) from public.profiles),
  1::bigint,
  'profiles: an unfiltered select returns only the caller''s own row'
);
select is(
  (select count(*) from public.profiles where id = '30000000-0000-0000-0000-0000000000b2'),
  0::bigint,
  'profiles: user A cannot see user B''s profile row'
);
reset role;

select * from finish();
rollback;
