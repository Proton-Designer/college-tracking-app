-- Proves the DB-level half of account deletion: (1) the Vault-secret cleanup wrapper
-- actually empties vault.secrets for the user, and (2) deleting the auth.users row (what
-- GoTrue's hard delete mechanically does -- proved live against a real local Supabase
-- instance, see 00000000000022's header comment) cascades to zero rows in EVERY
-- user-scoped table, not just the ones someone remembered to check.
--
-- Storage object removal and the real GoTrue admin.deleteUser() call are NOT provable
-- from pgTAP (no HTTP access, no Storage API) -- those are proven by the companion Deno
-- itest, account-delete.itest.ts, which also proves the authorization boundary (a second
-- user's token cannot delete the first user's account) and the confirmation-email guard.
--
-- Fixture reused directly from 03_rls_cross_user_isolation.test.sql's seed_fixture --
-- built for RLS testing, but it already seeds one row in every user-scoped table plus
-- both Vault-secret code paths (WHOOP's store_oauth_token, Brightspace's
-- store_brightspace_feed_url), which is exactly "a user with data in every table" this
-- test needs too. One fixture to maintain, not two that drift apart.
begin;
select no_plan();

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
  v_weekly_plan_id bigint;
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

  insert into public.weekly_plans (user_id, week_start_date, academic_load, total_needed_minutes, total_capacity_minutes, has_unplaced_work)
    values (p_user_id, date_trunc('week', current_date)::date, 'moderate', 300, 600, false)
    returning id into v_weekly_plan_id;

  insert into public.weekly_plan_blocks (user_id, weekly_plan_id, deliverable_id, course_id, block_date, start_at, end_at, minutes, status, task_id)
    values (p_user_id, v_weekly_plan_id, v_deliverable_id, v_course_id, current_date, now(), now() + interval '45 minutes', 45, 'confirmed', v_task_id);

  insert into public.weekly_plan_unplaced (user_id, weekly_plan_id, deliverable_id, course_id, minutes_needed, minutes_placed, minutes_shortfall, reason)
    values (p_user_id, v_weekly_plan_id, v_deliverable_id, v_course_id, 60, 0, 60, 'insufficient_capacity');
end;
$$;

-- ============================================================================
-- Generic zero-rows-everywhere assertion, dynamically enumerated (same technique as
-- check-demo-clean.mjs and 03's check_isolation) so a future table added without a
-- corresponding delete concern is caught by a loud failure here, not a silent gap.
-- ============================================================================
create or replace function pg_temp.assert_zero_rows_everywhere(p_user_id uuid)
returns setof text
language plpgsql
as $$
declare
  r record;
  remaining bigint;
begin
  for r in
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and exists (
        select 1 from information_schema.columns col
        where col.table_schema = 'public' and col.table_name = c.relname and col.column_name = 'user_id'
      )
    order by c.relname
  loop
    execute format('select count(*) from public.%I where user_id = $1', r.table_name)
      into remaining using p_user_id;
    return next is(remaining, 0::bigint, format('%s: zero rows remain for the deleted user', r.table_name));
  end loop;

  -- profiles keys on `id`, not `user_id` -- checked separately, same asymmetry 03 notes.
  execute 'select count(*) from public.profiles where id = $1' into remaining using p_user_id;
  return next is(remaining, 0::bigint, 'profiles: zero rows remain for the deleted user');
end;
$$;

-- ============================================================================
-- The actual test
-- ============================================================================
select pg_temp.seed_fixture('50000000-0000-0000-0000-0000000000d1', 'itest-account-deletion@test.local');

-- Sanity: the fixture actually seeded something real before we prove it's all gone --
-- an assertion that a bare, unseeded user has zero rows everywhere would pass trivially
-- and prove nothing (the exact failure mode the Lead flagged).
select ok(
  (select count(*) from public.courses where user_id = '50000000-0000-0000-0000-0000000000d1') = 1,
  'fixture sanity: the seeded user really does have a course row before deletion'
);
select ok(
  (select count(*) from public.oauth_connections where user_id = '50000000-0000-0000-0000-0000000000d1') = 1,
  'fixture sanity: the seeded user really does have an oauth_connections row (Vault-backed) before deletion'
);

-- Phase 1: Vault cleanup, via the same wrapper account-delete calls, run AS the user.
select is(
  (select vault_secret_id from public.oauth_connections where user_id = '50000000-0000-0000-0000-0000000000d1') is not null,
  true,
  'sanity: oauth_connections has a real vault_secret_id before cleanup'
);

set role authenticated;
set request.jwt.claims = '{"sub":"50000000-0000-0000-0000-0000000000d1","role":"authenticated"}';
select ok(
  (select public.delete_user_vault_secrets('50000000-0000-0000-0000-0000000000d1')) = 2,
  'delete_user_vault_secrets: reports exactly 2 secrets deleted (one WHOOP token, one Brightspace feed URL)'
);
reset role;

select is(
  (select count(*) from vault.secrets s
     join public.oauth_connections oc on oc.vault_secret_id = s.id
     where oc.user_id = '50000000-0000-0000-0000-0000000000d1'),
  0::bigint,
  'no vault.secrets row is reachable via oauth_connections for this user after cleanup'
);

-- brightspace_feeds' own vault_secret_id is now dangling (its FK cascade fired when the
-- referenced vault.secrets row was deleted, per migration 0022's FK fix) -- confirm the
-- row itself, not just the secret, no longer references anything live.
select is(
  (select count(*) from public.brightspace_feeds where user_id = '50000000-0000-0000-0000-0000000000d1' and vault_secret_id is not null),
  0::bigint,
  'brightspace_feeds no longer holds a live vault_secret_id after cleanup (cascade fired)'
);

-- Phase 2: mechanically what GoTrue's hard delete does -- proved live against the real
-- Admin API in account-delete.itest.ts; this proves the SQL side of that mechanism.
delete from auth.users where id = '50000000-0000-0000-0000-0000000000d1';

select * from pg_temp.assert_zero_rows_everywhere('50000000-0000-0000-0000-0000000000d1');

select * from finish();
rollback;
