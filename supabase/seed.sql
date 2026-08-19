-- Demo seed: one realistic mid-semester student, ~10 weeks into term. Dates are relative
-- to whenever this runs (current_date), so the demo always looks "live". Deterministic
-- via setseed() so repeated `supabase db reset` produces the same story.
--
-- Login: demo@collegeos.app / CollegeOS-Demo-2026 (local only -- see docs/DATA_MODEL.md).

select setseed(0.42);

do $$
declare
  v_user_id uuid := '00000000-0000-0000-0000-0000000000d1';
  v_term_start date := current_date - 75;
  v_term_end date := current_date + 45;

  v_bme_id bigint;
  v_phys_id bigint;
  v_chem_id bigint;
  v_cs_id bigint;
  v_engl_id bigint;

  v_cat_id bigint;
  v_item_id bigint;
  v_deliv_id bigint;
  v_bad_day_deliv_id bigint;
  v_backplan_id bigint;
  v_task_id bigint;
  v_kill_instagram bigint;
  v_kill_youtube bigint;
  v_report_id bigint;
  v_insight_id bigint;

  d date;
  i int;
  loop_i int;
  task_count int;
  v_energy int;
  v_mood int;
  v_sleep numeric;
  v_recovery numeric;
  v_mits_planned int;
  v_mits_completed int;
  v_distracting_min int;
  v_deep_work_actual_min int;
  v_is_weekend boolean;
  v_bad_day boolean;
  v_pick record;
begin
  ------------------------------------------------------------------------
  -- Identity
  ------------------------------------------------------------------------
  -- confirmation_token/recovery_token/email_change_token_new/email_change have no
  -- column default (NULL) but GoTrue's Go scanner expects a plain string, not NULL --
  -- a raw INSERT (as opposed to going through the Admin API) must set them explicitly
  -- to '' or every later password-grant login 500s with "converting NULL to string is
  -- unsupported". Learned the hard way; see the L4 report.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
    'demo@collegeos.app', crypt('CollegeOS-Demo-2026', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    '', '', '', ''
  );

  insert into auth.identities (
    id, provider_id, user_id, identity_data, provider, created_at, updated_at
  ) values (
    gen_random_uuid(), v_user_id::text, v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', 'demo@collegeos.app'),
    'email', now(), now()
  );

  update public.profiles
    set display_name = 'Mehdi',
        timezone = 'America/Indiana/Indianapolis',
        sleep_baseline_hours = 7.25,
        llm_monthly_budget_usd = 5.00
    where id = v_user_id;

  ------------------------------------------------------------------------
  -- Courses
  ------------------------------------------------------------------------
  insert into public.courses (user_id, code, name, professor_name, professor_contact, term, color, difficulty_rating, confidence_rating, target_grade_pct, late_policy, attendance_policy, allowed_absences)
    values (v_user_id, 'BME 301', 'Biomedical Instrumentation', 'Dr. Alvarez', 'alvarez@purdue.edu', 'Fall 2026', '#B23A48', 4, 3, 90, '-10%/day, max 3 days late', '3 free absences, then -1% final grade each', 3)
    returning id into v_bme_id;
  insert into public.courses (user_id, code, name, professor_name, term, color, difficulty_rating, confidence_rating, target_grade_pct, late_policy, attendance_policy, allowed_absences)
    values (v_user_id, 'PHYS 241', 'Electricity and Optics', 'Dr. Chen', 'Fall 2026', '#3A6EA5', 4, 3, 90, 'no late work accepted', 'attendance not graded', null)
    returning id into v_phys_id;
  insert into public.courses (user_id, code, name, professor_name, term, color, difficulty_rating, confidence_rating, target_grade_pct, late_policy, attendance_policy, allowed_absences)
    values (v_user_id, 'CHEM 255', 'Organic Chemistry I', 'Dr. Okafor', 'Fall 2026', '#4C9F70', 3, 2, 85, '-5%/day, max 2 days', '2 free absences', 2)
    returning id into v_chem_id;
  insert into public.courses (user_id, code, name, professor_name, term, color, difficulty_rating, confidence_rating, target_grade_pct, attendance_policy)
    values (v_user_id, 'CS 180', 'Problem Solving and OOP', 'Dr. Patel', 'Fall 2026', '#8850A0', 2, 4, 93, 'attendance not graded')
    returning id into v_cs_id;
  insert into public.courses (user_id, code, name, professor_name, term, color, difficulty_rating, confidence_rating, target_grade_pct, attendance_policy)
    values (v_user_id, 'ENGL 106', 'Technical Communication', 'Dr. Reyes', 'Fall 2026', '#C4841D', 2, 4, 90, 'workshop attendance required')
    returning id into v_engl_id;

  -- meetings (MWF/TR patterns)
  insert into public.course_meetings (user_id, course_id, day_of_week, start_time, end_time, location) values
    (v_user_id, v_bme_id, 1, '10:30', '11:20', 'MSEE 120'), (v_user_id, v_bme_id, 3, '10:30', '11:20', 'MSEE 120'), (v_user_id, v_bme_id, 5, '10:30', '11:20', 'MSEE 120'),
    (v_user_id, v_phys_id, 2, '09:00', '10:15', 'PHYS 112'), (v_user_id, v_phys_id, 4, '09:00', '10:15', 'PHYS 112'),
    (v_user_id, v_chem_id, 1, '13:30', '14:20', 'WTHR 200'), (v_user_id, v_chem_id, 3, '13:30', '14:20', 'WTHR 200'), (v_user_id, v_chem_id, 5, '13:30', '14:20', 'WTHR 200'),
    (v_user_id, v_cs_id, 2, '12:00', '13:15', 'LWSN B155'), (v_user_id, v_cs_id, 4, '12:00', '13:15', 'LWSN B155'),
    (v_user_id, v_engl_id, 5, '15:30', '17:20', 'HEAV 226');

  insert into public.course_office_hours (user_id, course_id, day_of_week, start_time, end_time, location) values
    (v_user_id, v_bme_id, 2, '14:00', '16:00', 'MSEE 340'),
    (v_user_id, v_phys_id, 3, '11:00', '12:30', 'PHYS 244'),
    (v_user_id, v_chem_id, 4, '10:00', '11:30', 'WTHR 336');

  insert into public.grade_boundaries (user_id, course_id, letter, min_pct)
    select v_user_id, c.id, b.letter, b.min_pct
    from (values (v_bme_id),(v_phys_id),(v_chem_id),(v_cs_id),(v_engl_id)) as c(id)
    cross join (values ('A',93),('A-',90),('B+',87),('B',83),('B-',80),('C+',77),('C',73),('C-',70),('D',60),('F',0)) as b(letter,min_pct);

  ------------------------------------------------------------------------
  -- Grading: BME 301 -- worked example matching packages/core's hand-verified test
  ------------------------------------------------------------------------
  insert into public.grade_categories (user_id, course_id, name, weight_pct, drop_lowest_n, expected_item_count)
    values (v_user_id, v_bme_id, 'Homework', 20, 1, 5) returning id into v_cat_id;
  insert into public.grade_items (user_id, course_id, category_id, name, points_earned, points_possible) values
    (v_user_id, v_bme_id, v_cat_id, 'HW1', 8, 10), (v_user_id, v_bme_id, v_cat_id, 'HW2', 9, 10),
    (v_user_id, v_bme_id, v_cat_id, 'HW3', 6, 10), (v_user_id, v_bme_id, v_cat_id, 'HW4', 10, 10),
    (v_user_id, v_bme_id, v_cat_id, 'HW5', 7, 10);
  insert into public.grade_categories (user_id, course_id, name, weight_pct, drop_lowest_n, expected_item_count)
    values (v_user_id, v_bme_id, 'Quizzes', 15, 1, 6) returning id into v_cat_id;
  insert into public.grade_items (user_id, course_id, category_id, name, points_earned, points_possible) values
    (v_user_id, v_bme_id, v_cat_id, 'Quiz 1', 18, 20), (v_user_id, v_bme_id, v_cat_id, 'Quiz 2', 15, 20),
    (v_user_id, v_bme_id, v_cat_id, 'Quiz 3', 20, 20), (v_user_id, v_bme_id, v_cat_id, 'Quiz 4', 12, 20);
  insert into public.grade_categories (user_id, course_id, name, weight_pct, drop_lowest_n, expected_item_count)
    values (v_user_id, v_bme_id, 'Midterm', 25, 0, 1) returning id into v_cat_id;
  insert into public.grade_items (user_id, course_id, category_id, name, points_earned, points_possible)
    values (v_user_id, v_bme_id, v_cat_id, 'Midterm Exam', 88, 100);
  insert into public.grade_categories (user_id, course_id, name, weight_pct, drop_lowest_n, expected_item_count)
    values (v_user_id, v_bme_id, 'Final', 40, 0, 1) returning id into v_cat_id;
  insert into public.grade_items (user_id, course_id, category_id, name, points_earned, points_possible)
    values (v_user_id, v_bme_id, v_cat_id, 'Final Exam', null, 100);

  -- PHYS 241: further behind, matches the brief's worked "HIGH ATTENTION" example
  insert into public.grade_categories (user_id, course_id, name, weight_pct, drop_lowest_n, expected_item_count)
    values (v_user_id, v_phys_id, 'Problem Sets', 25, 1, 8) returning id into v_cat_id;
  insert into public.grade_items (user_id, course_id, category_id, name, points_earned, points_possible)
    select v_user_id, v_phys_id, v_cat_id, 'PS' || g, (60 + (random() * 35))::int, 100
    from generate_series(1, 5) g;
  insert into public.grade_categories (user_id, course_id, name, weight_pct, drop_lowest_n, expected_item_count)
    values (v_user_id, v_phys_id, 'Labs', 20, 0, 6) returning id into v_cat_id;
  insert into public.grade_items (user_id, course_id, category_id, name, points_earned, points_possible)
    select v_user_id, v_phys_id, v_cat_id, 'Lab ' || g, (75 + (random() * 20))::int, 100
    from generate_series(1, 4) g;
  insert into public.grade_categories (user_id, course_id, name, weight_pct, drop_lowest_n, expected_item_count)
    values (v_user_id, v_phys_id, 'Exam 1', 25, 0, 1) returning id into v_cat_id;
  insert into public.grade_items (user_id, course_id, category_id, name, points_earned, points_possible)
    values (v_user_id, v_phys_id, v_cat_id, 'Exam 1', 79, 100);
  insert into public.grade_categories (user_id, course_id, name, weight_pct, drop_lowest_n, expected_item_count)
    values (v_user_id, v_phys_id, 'Final Exam', 30, 0, 1) returning id into v_cat_id;
  insert into public.grade_items (user_id, course_id, category_id, name, points_earned, points_possible)
    values (v_user_id, v_phys_id, v_cat_id, 'Final Exam', null, 100);

  -- CHEM 255: weights deliberately sum to 95 -- exercises the weightSumWarning in the UI.
  insert into public.grade_categories (user_id, course_id, name, weight_pct, drop_lowest_n, expected_item_count)
    values (v_user_id, v_chem_id, 'Problem Sets', 15, 1, 8) returning id into v_cat_id;
  insert into public.grade_items (user_id, course_id, category_id, name, points_earned, points_possible)
    select v_user_id, v_chem_id, v_cat_id, 'PS' || g, (70 + (random() * 25))::int, 100
    from generate_series(1, 6) g;
  insert into public.grade_categories (user_id, course_id, name, weight_pct, drop_lowest_n, expected_item_count)
    values (v_user_id, v_chem_id, 'Lab Reports', 20, 0, 5) returning id into v_cat_id;
  insert into public.grade_items (user_id, course_id, category_id, name, points_earned, points_possible)
    select v_user_id, v_chem_id, v_cat_id, 'Lab Report ' || g, (78 + (random() * 15))::int, 100
    from generate_series(1, 3) g;
  insert into public.grade_categories (user_id, course_id, name, weight_pct, drop_lowest_n, expected_item_count)
    values (v_user_id, v_chem_id, 'Midterm', 25, 0, 1) returning id into v_cat_id;
  insert into public.grade_items (user_id, course_id, category_id, name, points_earned, points_possible)
    values (v_user_id, v_chem_id, v_cat_id, 'Midterm', 71, 100);
  insert into public.grade_categories (user_id, course_id, name, weight_pct, drop_lowest_n, expected_item_count)
    values (v_user_id, v_chem_id, 'Final', 35, 0, 1) returning id into v_cat_id;
  insert into public.grade_items (user_id, course_id, category_id, name, points_earned, points_possible)
    values (v_user_id, v_chem_id, v_cat_id, 'Final', null, 100);

  -- CS 180: comfortable, low risk.
  insert into public.grade_categories (user_id, course_id, name, weight_pct, drop_lowest_n, expected_item_count)
    values (v_user_id, v_cs_id, 'Projects', 50, 0, 5) returning id into v_cat_id;
  insert into public.grade_items (user_id, course_id, category_id, name, points_earned, points_possible)
    select v_user_id, v_cs_id, v_cat_id, 'Project ' || g, (90 + (random() * 10))::int, 100
    from generate_series(1, 4) g;
  insert into public.grade_categories (user_id, course_id, name, weight_pct, drop_lowest_n, expected_item_count)
    values (v_user_id, v_cs_id, 'Exams', 50, 0, 2) returning id into v_cat_id;
  insert into public.grade_items (user_id, course_id, category_id, name, points_earned, points_possible)
    values (v_user_id, v_cs_id, v_cat_id, 'Exam 1', 91, 100);

  -- ENGL 106: on track.
  insert into public.grade_categories (user_id, course_id, name, weight_pct, drop_lowest_n, expected_item_count)
    values (v_user_id, v_engl_id, 'Drafts', 40, 0, 4) returning id into v_cat_id;
  insert into public.grade_items (user_id, course_id, category_id, name, points_earned, points_possible)
    select v_user_id, v_engl_id, v_cat_id, 'Draft ' || g, (85 + (random() * 10))::int, 100
    from generate_series(1, 3) g;
  insert into public.grade_categories (user_id, course_id, name, weight_pct, drop_lowest_n, expected_item_count)
    values (v_user_id, v_engl_id, 'Final Portfolio', 60, 0, 1) returning id into v_cat_id;
  insert into public.grade_items (user_id, course_id, category_id, name, points_earned, points_possible)
    values (v_user_id, v_engl_id, v_cat_id, 'Final Portfolio', null, 100);

  ------------------------------------------------------------------------
  -- Deliverables (upcoming + a few just-completed), with backplans
  ------------------------------------------------------------------------
  insert into public.deliverables (user_id, course_id, title, type, due_at, estimated_minutes, status)
    values (v_user_id, v_bme_id, 'Instrumentation Report', 'report',
            (current_date + 10)::timestamptz + time '23:59', 480, 'not_started')
    returning id into v_deliv_id;
  insert into public.deliverable_backplans (user_id, deliverable_id, target_completion_date, compressed)
    values (v_user_id, v_deliv_id, current_date + 9, false) returning id into v_backplan_id;
  insert into public.backplan_milestones (user_id, backplan_id, phase, milestone_date, minutes) values
    (v_user_id, v_backplan_id, 'understand', current_date + 1, 48),
    (v_user_id, v_backplan_id, 'sources', current_date + 3, 96),
    (v_user_id, v_backplan_id, 'outline', current_date + 4, 48),
    (v_user_id, v_backplan_id, 'draft', current_date + 6, 144),
    (v_user_id, v_backplan_id, 'revise', current_date + 8, 96),
    (v_user_id, v_backplan_id, 'final', current_date + 9, 48);

  insert into public.deliverables (user_id, course_id, title, type, due_at, estimated_minutes, status)
    values (v_user_id, v_phys_id, 'Exam 2', 'exam',
            (current_date + 9)::timestamptz + time '09:00', 300, 'not_started')
    returning id into v_deliv_id;
  insert into public.deliverable_backplans (user_id, deliverable_id, target_completion_date, compressed)
    values (v_user_id, v_deliv_id, current_date + 8, false) returning id into v_backplan_id;
  insert into public.backplan_milestones (user_id, backplan_id, phase, milestone_date, minutes) values
    (v_user_id, v_backplan_id, 'inventory', current_date + 2, 30),
    (v_user_id, v_backplan_id, 'concept pass', current_date + 4, 75),
    (v_user_id, v_backplan_id, 'retrieval practice', current_date + 6, 120),
    (v_user_id, v_backplan_id, 'weak-spot pass', current_date + 7, 60),
    (v_user_id, v_backplan_id, 'light review', current_date + 8, 15);

  insert into public.deliverables (user_id, course_id, title, type, due_at, estimated_minutes, status)
    values (v_user_id, v_chem_id, 'Problem Set 7', 'problem_set',
            (current_date + 3)::timestamptz + time '23:59', 120, 'in_progress')
    returning id into v_deliv_id;
  insert into public.deliverable_backplans (user_id, deliverable_id, target_completion_date, compressed)
    values (v_user_id, v_deliv_id, current_date + 2, false) returning id into v_backplan_id;
  insert into public.backplan_milestones (user_id, backplan_id, phase, milestone_date, minutes, completed) values
    (v_user_id, v_backplan_id, 'understand', current_date - 1, 18, true),
    (v_user_id, v_backplan_id, 'attempt', current_date, 60, false),
    (v_user_id, v_backplan_id, 'stuck-review', current_date + 1, 24, false),
    (v_user_id, v_backplan_id, 'check', current_date + 2, 18, false);

  insert into public.deliverables (user_id, course_id, title, type, due_at, estimated_minutes, status)
    values (v_user_id, v_cs_id, 'Project 5: Recursion', 'project',
            (current_date + 14)::timestamptz + time '23:59', 360, 'not_started');
  insert into public.deliverables (user_id, course_id, title, type, due_at, estimated_minutes, status)
    values (v_user_id, v_engl_id, 'Final Portfolio', 'paper',
            (current_date + 40)::timestamptz + time '23:59', 300, 'not_started');
  insert into public.deliverables (user_id, course_id, title, type, due_at, estimated_minutes, status)
    values (v_user_id, v_bme_id, 'HW6', 'problem_set',
            (current_date + 5)::timestamptz + time '23:59', 90, 'not_started');
  -- Completed, past deliverables so history isn't empty.
  insert into public.deliverables (user_id, course_id, title, type, due_at, estimated_minutes, status)
    values (v_user_id, v_bme_id, 'HW5', 'problem_set', (current_date - 4)::timestamptz + time '23:59', 90, 'completed');
  insert into public.deliverables (user_id, course_id, title, type, due_at, estimated_minutes, status)
    values (v_user_id, v_phys_id, 'Exam 1', 'exam', (current_date - 21)::timestamptz + time '09:00', 300, 'completed');
  -- Still not_started and badly overdue -- the thing the bad day (i = 22 below) never got
  -- to. Due the day after that day, so it's the hard deadline the Minimum Viable Day
  -- keeps; on today's live view it's a genuinely overdue item, which is the honest
  -- consequence of a Recovery Mode day nobody recovered from at the time.
  insert into public.deliverables (user_id, course_id, title, type, due_at, estimated_minutes, status)
    values (v_user_id, v_chem_id, 'Lab Report 2', 'report', (current_date - 21)::timestamptz + time '23:59', 90, 'not_started')
    returning id into v_bad_day_deliv_id;

  ------------------------------------------------------------------------
  -- Kill habits
  ------------------------------------------------------------------------
  insert into public.kill_habits (user_id, name, trigger_description, urge_description, immediate_reward, long_term_cost, replacement_behavior, implementation_intention, escalation_level, active)
    values (v_user_id, 'Instagram relapse', 'Difficult homework question', 'Escape from frustration', 'Immediate relief, dopamine hit', 'Lost 45+ minutes, momentum broken', 'Write down the question, work 5 more minutes',
            'IF I reach for Instagram while stuck on schoolwork, THEN I write down the question I''m stuck on and work on it for five more minutes before deciding whether to take a break.',
            'l1_stronger_notification', true)
    returning id into v_kill_instagram;
  insert into public.kill_habits (user_id, name, trigger_description, urge_description, immediate_reward, long_term_cost, replacement_behavior, implementation_intention, escalation_level, active)
    values (v_user_id, 'YouTube in bed', 'Lying down after a long day', 'Passive entertainment before sleep', 'Feels relaxing in the moment', 'Pushes bedtime 45-90 minutes, worse next-day energy', 'Phone charges outside the bedroom',
            'IF I am in bed and reach for my phone, THEN I plug it in at the dresser instead.',
            'l0_reminder', true)
    returning id into v_kill_youtube;

  ------------------------------------------------------------------------
  -- 30-day history: checkins, predictions, reviews, tasks, sessions, kill events,
  -- friction logs, health/screen telemetry. Weighted randomness for believable variation,
  -- including one real Recovery Mode day (bad sleep + overdue tasks + missed checkin).
  ------------------------------------------------------------------------
  for i in reverse 29..0 loop
    d := current_date - i;
    v_is_weekend := extract(dow from d) in (0, 6);
    -- Day 22 is the deliberate "terrible day" -- poor sleep, overdue pile-up, recovery mode.
    v_bad_day := (i = 22);

    v_sleep := case when v_bad_day then 4.2 when v_is_weekend then 8.1 + random() * 1.2 else 6.6 + random() * 1.3 end;
    v_recovery := case when v_bad_day then 28 when v_is_weekend then 65 + random() * 20 else 45 + random() * 35 end;
    v_energy := greatest(1, least(10, round((v_sleep - 2.5) + (random() * 2 - 1))::int));
    v_mood := greatest(1, least(10, v_energy + round(random() * 2 - 1)::int));
    v_distracting_min := case when v_bad_day then (90 + random() * 40)::int else (25 + random() * 45)::int end;

    insert into public.health_daily (user_id, local_date, sleep_hours, whoop_recovery_pct, hrv_ms, resting_hr, strain, workout_completed, source)
      values (v_user_id, d, round(v_sleep, 1), round(v_recovery, 0), 55 + random() * 25, 58 + random() * 10, 8 + random() * 8, (random() > 0.55), 'whoop');

    insert into public.telemetry_events (user_id, occurred_at, source, type, metric, value, unit)
      values (v_user_id, d::timestamptz + time '07:00', 'whoop', 'sleep', 'sleep_duration', round(v_sleep, 2), 'hours');

    insert into public.screen_daily (user_id, local_date, total_screen_min, distracting_min, productive_min, source)
      values (v_user_id, d, (150 + random() * 120)::int, v_distracting_min, (140 + random() * 90)::int, 'rescuetime')
      on conflict (user_id, local_date) do nothing;

    -- Missed morning check-in on the bad day (Recovery Mode signal), otherwise submitted.
    if not v_bad_day then
      insert into public.daily_checkins (user_id, local_date, energy, mood, derailment_reason, capacity_minutes, floor_minutes, target_minutes, recovery_mode_triggered, recovery_mode_total)
        values (v_user_id, d, v_energy, v_mood,
                (array['phone','fatigue','avoidance','schedule','none'])[1 + floor(random()*5)::int],
                180 + random() * 60, 60 + random() * 40, 150 + random() * 50, false, (random()*3)::int);

      insert into public.daily_predictions (user_id, local_date, predicted_completion_pct, expected_energy_tonight, likely_failure_mode)
        values (v_user_id, d, round(55 + random() * 35), greatest(1, least(10, v_energy + round(random()*2-1)::int)),
                (array['phone after class','fatigue by evening','underestimated a problem set','schedule conflict'])[1 + floor(random()*4)::int]);
    else
      insert into public.daily_checkins (user_id, local_date, energy, mood, derailment_reason, capacity_minutes, floor_minutes, target_minutes, recovery_mode_triggered, recovery_mode_total)
        values (v_user_id, d, 2, 3, 'fatigue', 90, 120, 90, true, 7);
    end if;

    v_mits_planned := case when v_is_weekend then 2 else 3 end;
    v_mits_completed := case when v_bad_day then 0 when v_is_weekend then 1 + floor(random()*2)::int else 1 + floor(random()*3)::int end;
    v_deep_work_actual_min := case when v_bad_day then 20
      else round((v_mits_completed::numeric / greatest(v_mits_planned, 1)) * (140 + random() * 70))::int end;

    insert into public.daily_reviews (user_id, local_date, mits_planned, mits_completed, deep_work_planned_min, deep_work_actual_min, screen_time_min, distracting_time_min, workout_completed, kill_list_success_count, kill_list_total, proud_text, went_wrong_text, important_note_text)
      values (v_user_id, d,
              v_mits_planned,
              v_mits_completed,
              round(150 + random() * 60)::int,
              v_deep_work_actual_min,
              (150 + random() * 120)::int,
              v_distracting_min,
              (random() > 0.55),
              case when v_bad_day then 0 else 1 + floor(random()*2)::int end,
              2,
              case when v_bad_day then null else 'Got through the reading before lab even though I started late.' end,
              case when v_bad_day then 'Slept terribly, spent the morning behind and never really caught up.' else null end,
              case when v_bad_day then 'Today felt like a real slide -- rolling everything but the essentials forward.' else null end);

    -- score yesterday's prediction from today's actuals (simple, believable coupling)
    update public.daily_predictions p
      set actual_completion_pct = round((r.mits_completed::numeric / greatest(r.mits_planned,1)) * 100, 1),
          scored_at = (d + 1)::timestamptz + time '22:00'
      from public.daily_reviews r
      where p.user_id = v_user_id and r.user_id = v_user_id and p.local_date = d and r.local_date = d;

    -- 1-3 tasks per weekday, fewer on weekends. The bad day gets its own deliberately
    -- uncompleted set instead of the random completed ones, so the Minimum Viable Day
    -- (packages/core §6) has real material: a hard deadline (linked to the overdue Lab
    -- Report 2 above), attendance (the explicit CHEM lab calendar_event below), and
    -- ordinary discretionary tasks that get rolled forward, not silently dropped.
    if not v_bad_day then
      task_count := case when v_is_weekend then 1 + floor(random()*2)::int else 2 + floor(random()*2)::int end;
      for loop_i in 1..task_count loop
        select * into v_pick from (values
          (v_bme_id, 'BME problem review', 'problem_set', 45, 1.2),
          (v_phys_id, 'PHYS reading', 'reading', 40, 0.9),
          (v_chem_id, 'CHEM lab prep', 'lab_report', 60, 1.4),
          (v_cs_id, 'CS 180 coding practice', 'coding', 50, 1.3),
          (v_engl_id, 'ENGL revision', 'writing', 35, 1.05)
        ) as t(course_id, title, category, est, mult)
        order by random() limit 1;

        insert into public.tasks (user_id, course_id, title, category, estimated_minutes, actual_minutes, planned_date, status, completed_at)
          values (v_user_id, v_pick.course_id, v_pick.title, v_pick.category, v_pick.est,
                  round(v_pick.est * v_pick.mult * (0.85 + random()*0.3))::int,
                  d, 'completed', d::timestamptz + time '20:00')
          returning id into v_task_id;

        insert into public.task_sessions (user_id, task_id, planned_start, actual_start, planned_duration_min, actual_duration_min, location, interruptions, subjective_focus, phone_usage_min, status)
          select v_user_id, v_task_id, d::timestamptz + time '16:00', d::timestamptz + time '16:00' + (random()*40||' minutes')::interval,
                 t.estimated_minutes, t.actual_minutes,
                 (array['Hicks library','WALC','dorm room','MSEE study room'])[1+floor(random()*4)::int],
                 floor(random()*3)::int, 2 + floor(random()*3)::int, floor(random()*15)::int, 'completed'
          from public.tasks t where t.id = v_task_id;
      end loop;
    else
      -- Hard deadline: linked to Lab Report 2 (due the next day), never reached that day
      -- -- this is the item MVD keeps, kill-list-style, no matter what.
      insert into public.tasks (user_id, course_id, deliverable_id, title, category, estimated_minutes, planned_date, status)
        values (v_user_id, v_chem_id, v_bad_day_deliv_id, 'CHEM Lab Report 2 write-up', 'lab_report', 60, d, 'in_progress')
        returning id into v_task_id;
      -- Abandoned, not completed -- 12 of 60 planned minutes before giving up, matching
      -- the day's story (the task itself is still 'in_progress', never finished). Must
      -- never train calibration the way a real completed-duration observation would.
      insert into public.task_sessions (user_id, task_id, planned_start, actual_start, planned_duration_min, actual_duration_min, location, interruptions, subjective_focus, phone_usage_min, status)
        values (v_user_id, v_task_id, d::timestamptz + time '16:00', d::timestamptz + time '16:05', 60, 12, 'dorm room', 4, 1, 25, 'abandoned');

      -- One ordinary discretionary task, never started -- exactly what "Rolled forward
      -- (N)" exists to disclose rather than silently drop. Deliberately just one, not
      -- several: recoveryMode.ts's overdueTaskCount has no time window (any uncompleted
      -- task before "today", however long ago), so every day after this one inherits
      -- whatever's still unresolved from it. The `overdueTasks` signal only activates at
      -- >= 3 (packages/core/src/recovery/trigger.ts) -- two forever-unresolved tasks from
      -- this day (this one plus the hard deadline above) stays under that, so today's own
      -- live Recovery Mode state isn't accidentally flipped by history. Confirmed live.
      insert into public.tasks (user_id, course_id, title, category, estimated_minutes, planned_date, status) values
        (v_user_id, v_bme_id, 'BME problem review', 'problem_set', 45, d, 'pending');
    end if;

    -- kill events: occasional relapse, mostly resisted, one longer lapse around the bad day
    if random() < 0.35 or v_bad_day then
      insert into public.kill_events (user_id, kill_habit_id, occurred_at, trigger_context, mood_before, duration_min, outcome)
        values (v_user_id, v_kill_instagram, d::timestamptz + time '16:45',
                'Got stuck on a problem set question', 3 + floor(random()*3)::int,
                case when v_bad_day then 55 else 15 + floor(random()*20)::int end,
                case when v_bad_day or i in (21,20) then 'relapsed' else 'resisted' end);
    end if;
    if random() < 0.2 then
      insert into public.kill_events (user_id, kill_habit_id, occurred_at, trigger_context, mood_before, outcome)
        values (v_user_id, v_kill_youtube, d::timestamptz + time '23:10', 'Lying in bed', 5 + floor(random()*3)::int,
                case when random() < 0.7 then 'resisted' else 'relapsed' end);
    end if;

    -- friction logs on days with incomplete MITs
    if v_mits_completed < (case when v_is_weekend then 2 else 3 end) then
      insert into public.friction_logs (user_id, occurred_at, cause, cause_detail)
        values (v_user_id, d::timestamptz + time '21:00',
                (array['underestimated_duration','unclear_next_action','distracted','tired','schedule_changed','avoided_task','higher_priority_appeared']::friction_cause[])[1+floor(random()*7)::int],
                null);
    end if;
  end loop;

  ------------------------------------------------------------------------
  -- Overdue tasks right now (feeds Recovery Mode's overdue-count signal + Today screen)
  ------------------------------------------------------------------------
  insert into public.tasks (user_id, course_id, title, category, estimated_minutes, planned_date, status) values
    (v_user_id, v_chem_id, 'Redo missed lab prelab quiz', 'admin', 20, current_date - 2, 'pending'),
    (v_user_id, v_phys_id, 'Office hours question list', 'admin', 15, current_date - 1, 'pending');

  -- Today's Top 3 MITs
  insert into public.tasks (user_id, course_id, title, category, estimated_minutes, planned_date, status, mit_rank) values
    (v_user_id, v_chem_id, 'Finish Problem Set 7', 'problem_set', 60, current_date, 'in_progress', 1),
    (v_user_id, v_phys_id, 'Exam 2 retrieval practice block', 'exam_prep', 75, current_date, 'pending', 2),
    (v_user_id, null, 'Gym', 'health', 45, current_date, 'pending', 3);

  ------------------------------------------------------------------------
  -- Decision journal, insights, one experiment, a nightly report
  ------------------------------------------------------------------------
  insert into public.decision_journal (user_id, occurred_at, decision, rationale, prediction_pct, predicted_outcome, actual_outcome, scored_at)
    values (v_user_id, (current_date - 5)::timestamptz + time '21:30',
            'Skip tonight''s BME block and study tomorrow morning instead',
            'I believe I''ll be sharper after a full night''s sleep than grinding tired tonight.',
            80, 'Complete the BME reading before 10am class', 'Did not happen -- overslept and did it during lunch instead',
            (current_date - 4)::timestamptz + time '13:00');

  insert into public.insights (user_id, claim, evidence, confidence_claimed_by_model, confidence_stored, sample_size, effect_size, status)
    values (v_user_id, 'Planned study durations run about 25-30% short of actual, most visibly for lab reports and coding tasks.',
            '{"observedRatio":1.28}'::jsonb, 'high', 'medium', 14, 0.28, 'active')
    returning id into v_insight_id;
  insert into public.insights (user_id, claim, evidence, confidence_claimed_by_model, confidence_stored, sample_size, effect_size, status)
    values (v_user_id, 'Social-media relapses cluster in the 30 minutes after getting stuck on a hard problem set question.',
            '{"clusterWindowMin":30}'::jsonb, 'high', 'testing', 6, 0.4, 'active');

  insert into public.experiments (user_id, insight_id, hypothesis, protocol, start_date, end_date, status, outcome_summary)
    values (v_user_id, v_insight_id,
            'Adding a fixed 30% buffer to estimated durations for lab reports and coding tasks will reduce evening schedule slippage.',
            'For 7 days: multiply every lab-report and coding-task estimate by 1.3 before scheduling. Track whether the day''s last planned block still starts on time.',
            current_date - 6, current_date + 1, 'running', null);

  insert into public.agent_reports (user_id, local_date, report_type, payload, model)
    values (v_user_id, current_date - 1, 'nightly',
      jsonb_build_object(
        'headline', 'You completed both academically critical tasks despite a rough start.',
        'objective_summary', 'MITs 2/3 complete, 2h10m deep work against a 2h30m plan.',
        'wins', jsonb_build_array(jsonb_build_object('claim','Finished the CHEM lab prep before it was due','evidence', jsonb_build_array('task completed 20:14, due 23:59'),'confidence',0.95)),
        'failures', jsonb_build_array(jsonb_build_object('claim','Gym task rolled over again','evidence', jsonb_build_array('3rd consecutive day marked pending'),'confidence',0.9)),
        'data_gaps', jsonb_build_array('No RescueTime category breakdown available yet for today')
      ),
      'claude-sonnet-5')
    returning id into v_report_id;

  insert into public.daily_summaries (user_id, local_date, summary)
    select v_user_id, gd::date, jsonb_build_object('mitsCompleted', 2, 'deepWorkMin', 130, 'notableEvent', null)
    from generate_series(current_date - 6, current_date - 1, interval '1 day') gd;

  insert into public.weekly_summaries (user_id, week_start_date, summary)
    values (v_user_id, date_trunc('week', current_date - 7)::date,
            jsonb_build_object('academicLoad', 'high', 'topRisk', 'PHYS 241 Exam 2', 'planAccuracyPct', 71));

  ------------------------------------------------------------------------
  -- Calendar events for the last 30 days and the coming two weeks, generated from the
  -- recurring meetings -- history included (not just the upcoming window) so the Day
  -- Trace and Minimum Viable Day have real class-attendance material on past dates too,
  -- not only days the user hasn't lived through yet.
  ------------------------------------------------------------------------
  insert into public.calendar_events (user_id, source, title, start_at, end_at, is_class_meeting, course_id)
  select v_user_id, 'manual', c.code || ' lecture',
         gd::date + m.start_time, gd::date + m.end_time, true, m.course_id
  from generate_series(current_date - 29, current_date + 13, interval '1 day') gd
  join public.course_meetings m on m.day_of_week = extract(dow from gd) and m.user_id = v_user_id
  join public.courses c on c.id = m.course_id;

  insert into public.calendar_events (user_id, source, title, start_at, end_at, is_busy) values
    (v_user_id, 'manual', 'Dinner with roommates', (current_date + 2)::timestamptz + time '18:00', (current_date + 2)::timestamptz + time '19:00', true),
    (v_user_id, 'manual', 'BME study group', (current_date + 4)::timestamptz + time '19:00', (current_date + 4)::timestamptz + time '21:00', true);

  -- The bad day's CHEM lab -- guaranteed regardless of what day-of-week it lands on
  -- (the recurring-meetings join above only fires if that weekday happens to have a
  -- scheduled section), so the attendance obligation the MVD keeps is never left to chance.
  insert into public.calendar_events (user_id, source, title, start_at, end_at, is_class_meeting, course_id)
    values (v_user_id, 'manual', 'CHEM 255 lab', (current_date - 22)::timestamptz + time '10:00', (current_date - 22)::timestamptz + time '11:30', true, v_chem_id);

end $$;
