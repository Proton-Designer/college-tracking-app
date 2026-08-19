#!/usr/bin/env node
/**
 * Guards against demo@collegeos.app accumulating test-write contamination.
 *
 * demo's entire value is being a realistic, stable, curated semester -- Nova and Atlas
 * both use it for screenshots and manual verification. This session found it polluted
 * three separate times (7 garbage task_sessions with 5-figure planned_duration_min
 * values that blew out a Day Trace axis; 6 friction_logs dated 2099 that would have
 * silently poisoned any windowed trend query; leftover kill_habits/tasks/syllabus_uploads
 * from earlier itest runs). Each was fixed file-by-file after the fact. This catches the
 * next one before it needs a debugging session.
 *
 * Requires a live local Supabase stack -- this is a dev-environment guard, not a source-
 * of-truth correctness proof like check-core-mirror. Skips (exit 0, warning) rather than
 * failing verify when the stack isn't reachable, since `npm run verify` must still be
 * runnable before `supabase start`.
 */
import { execFileSync, spawnSync } from 'node:child_process';

const DEMO_USER_ID = '00000000-0000-0000-0000-0000000000d1';
// Real seeded data has deliverables/calendar events weeks to a couple months out, never
// years -- anything beyond a year from today on demo's data is essentially certain to be
// a test artifact (the 2099 friction_logs bug was ~73 years out).
const FAR_FUTURE_DAYS = 365;
const KNOWN_KILL_HABITS = 2; // seed.sql: "Instagram relapse", "YouTube in bed"
const KNOWN_SYLLABUS_UPLOADS = 0; // seed.sql seeds courses directly, never via syllabus_uploads

function getSupabaseStatus() {
  try {
    const raw = execFileSync('npx', ['supabase', 'status', '-o', 'json'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Returns stdout (query results) and stderr (psql NOTICE output -- psql always sends
 *  RAISE NOTICE to stderr, never stdout, regardless of client_min_messages) combined,
 *  since the dynamic date-column check below reports its findings via NOTICE. */
function runSql(sql) {
  const result = spawnSync(
    'docker',
    ['exec', 'supabase_db_college-app', 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-c', sql],
    { encoding: 'utf8' },
  );
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
}

const status = getSupabaseStatus();
if (!status) {
  console.warn('⚠ check:demo-clean — local Supabase not reachable, skipping (this check only runs against a live local stack).');
  process.exit(0);
}

const findings = [];

// 1. Any date/timestamp column on a user_id-scoped table holding a value implausibly far
// in the future for demo, discovered dynamically so this doesn't go stale as tables are
// added -- excludes created_at/updated_at (audit columns, not meaningful "future" signals).
const dateColumnFindings = runSql(`
  do $$
  declare
    r record;
    cnt integer;
  begin
    for r in
      select c.table_name, c.column_name
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.data_type in ('date', 'timestamp with time zone', 'timestamp without time zone')
        and c.column_name not in ('created_at', 'updated_at')
        and exists (
          select 1 from information_schema.columns u
          where u.table_schema = 'public' and u.table_name = c.table_name and u.column_name = 'user_id'
        )
    loop
      execute format(
        'select count(*) from public.%I where user_id = %L and %I > (now() + interval ''${FAR_FUTURE_DAYS} days'')',
        r.table_name, '${DEMO_USER_ID}', r.column_name
      ) into cnt;
      if cnt > 0 then
        raise notice 'DATE_FINDING|%|%|%', r.table_name, r.column_name, cnt;
      end if;
    end loop;
  end $$;
`);
for (const line of dateColumnFindings.split('\n')) {
  const match = line.match(/DATE_FINDING\|(\w+)\|(\w+)\|(\d+)/);
  if (match) {
    const [, table, column, count] = match;
    findings.push(`${count} row(s) in ${table}.${column} dated more than ${FAR_FUTURE_DAYS} days out on demo`);
  }
}

// 2. Test-shaped titles left behind on tasks (the pow-test-/focus-session-test- family).
const testTaskTitles = runSql(
  `select count(*) from public.tasks where user_id = '${DEMO_USER_ID}' and (title ilike '%test%' or title ilike 'pow-test-%');`,
).trim();
if (Number(testTaskTitles) > 0) {
  findings.push(`${testTaskTitles} task(s) on demo with a test-shaped title (contains "test" or "pow-test-")`);
}

// 3. kill_habits / syllabus_uploads beyond the exact seeded set.
const killHabitsCount = runSql(`select count(*) from public.kill_habits where user_id = '${DEMO_USER_ID}';`).trim();
if (Number(killHabitsCount) !== KNOWN_KILL_HABITS) {
  findings.push(`demo has ${killHabitsCount} kill_habits, expected exactly ${KNOWN_KILL_HABITS} (seeded)`);
}
const syllabusUploadsCount = runSql(`select count(*) from public.syllabus_uploads where user_id = '${DEMO_USER_ID}';`).trim();
if (Number(syllabusUploadsCount) !== KNOWN_SYLLABUS_UPLOADS) {
  findings.push(`demo has ${syllabusUploadsCount} syllabus_uploads, expected exactly ${KNOWN_SYLLABUS_UPLOADS} (seeded)`);
}

if (findings.length > 0) {
  console.error('✗ demo@collegeos.app carries synthetic test artifacts:\n');
  for (const finding of findings) console.error(`  - ${finding}`);
  console.error(
    '\nA shared fixture decays silently without a check like this one. Clean up the contaminating rows, then fix the itest\n' +
      'that wrote them to use a dedicated throwaway user instead (see focusSessions.itest.ts for the pattern) --\n' +
      'reads against demo, writes against a throwaway.',
  );
  process.exit(1);
}

console.log('✓ demo@collegeos.app carries no detected synthetic artifacts');
