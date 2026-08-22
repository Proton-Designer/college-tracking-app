import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { addDays, localTimeToInstant } from '@collegeos/core';
import { getUserLocalToday } from '../day/today';
import { generateAndPersistWeeklyPlan, getWeeklyPlan, updateWeeklyPlanBlockStatus } from '../planning/weeklyPlan';
import { createConfirmedUser, SUPABASE_ANON_KEY, SUPABASE_URL } from './testSupport';
import type { Database } from '../database.types';
import type { TypedSupabaseClient } from '../client/types';

const TIMEZONE = 'America/Indiana/Indianapolis';

// Weekly planning's DB orchestration layer -- the pure algorithm (buildWeeklyPlan) is
// already exhaustively unit-tested offline; this proves the real queries assemble the
// right inputs from real data and persistence round-trips correctly. Dedicated throwaway
// user per "reads against demo, writes against a throwaway."
describe('generateAndPersistWeeklyPlan', () => {
  let client: TypedSupabaseClient;
  let userId: string;
  let today: string;
  let weekStart: string;

  beforeAll(async () => {
    const email = `itest-weeklyplan-${Date.now()}@collegeos.test`;
    const password = 'itest-weeklyplan-password-1';
    const user = await createConfirmedUser(email, password);
    userId = user.id;

    client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY!);
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    today = getUserLocalToday(TIMEZONE);
    weekStart = today;

    // computeHistoricalCapacityP50Min's median is exactly 0 for a user with zero
    // daily_reviews history (a real, separate cold-start gap flagged to the Lead, not
    // something to work around silently) -- without seeding some, computeCapacityMinutes
    // would clip every day's free intervals down to zero and no test below could ever
    // observe a real placement. A few days of realistic deep-work history establishes a
    // real capacity baseline, the same way an actual user's would over time.
    const reviewRows = Array.from({ length: 5 }, (_, i) => ({
      user_id: userId,
      local_date: addDays(today, -(i + 1)),
      deep_work_actual_min: 180,
    }));
    const { error: reviewError } = await client.from('daily_reviews').insert(reviewRows);
    if (reviewError) throw reviewError;
  });

  async function createCourse(code: string) {
    const { data, error } = await client.from('courses').insert({ user_id: userId, code, name: code, term: 'Fall 2026' }).select('id').single();
    expect(error).toBeNull();
    return data!.id;
  }

  async function createDeliverable(courseId: number, title: string, dueInDays: number, estimatedMinutes: number | null) {
    const dueDate = addDays(today, dueInDays);
    const { data, error } = await client
      .from('deliverables')
      // local_due_date is overwritten by deliverables_sync_local_due_date's trigger from
      // due_at + the profile's real timezone -- this placeholder is never actually used.
      .insert({ user_id: userId, course_id: courseId, title, type: 'problem_set', due_at: `${dueDate}T23:59:00Z`, local_due_date: dueDate, estimated_minutes: estimatedMinutes })
      .select('id')
      .single();
    expect(error).toBeNull();
    return data!.id;
  }

  it('places a deliverable with an open task into a real free interval and persists an accurate plan row', async () => {
    const courseId = await createCourse(`WKPLAN${Date.now() % 100000}`);
    const deliverableId = await createDeliverable(courseId, 'Problem Set 1', 4, null);
    const { error: taskError } = await client
      .from('tasks')
      .insert({ user_id: userId, course_id: courseId, deliverable_id: deliverableId, title: 'Work on PS1', category: 'problem_set', estimated_minutes: 90, planned_date: today, status: 'pending' });
    expect(taskError).toBeNull();

    const result = await generateAndPersistWeeklyPlan(client, userId, weekStart, today);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.plan.blocks.some((b) => b.deliverableId === deliverableId)).toBe(true);
    expect(result.data.skippedForMissingEstimate).toEqual([]);

    const { data: planRow } = await client.from('weekly_plans').select('*').eq('id', result.data.planId).single();
    expect(planRow!.week_start_date).toBe(weekStart);
    expect(planRow!.total_needed_minutes).toBeGreaterThanOrEqual(90);

    const { data: blockRows } = await client.from('weekly_plan_blocks').select('*').eq('weekly_plan_id', result.data.planId);
    expect(blockRows!.some((b) => b.deliverable_id === deliverableId)).toBe(true);
  });

  it('a deliverable with neither tasks nor its own estimate is excluded and reported with an actionable message, not silently dropped', async () => {
    const courseId = await createCourse(`WKPLAN${Date.now() % 100000}`);
    const deliverableId = await createDeliverable(courseId, 'Unsized Report', 3, null);

    const result = await generateAndPersistWeeklyPlan(client, userId, weekStart, today, { force: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const skipped = result.data.skippedForMissingEstimate.find((s) => s.deliverableId === deliverableId);
    expect(skipped).toBeDefined();
    expect(skipped!.message).toContain('Unsized Report');
    expect(result.data.plan.blocks.some((b) => b.deliverableId === deliverableId)).toBe(false);
  });

  it('a deliverable with its own estimated_minutes but no tasks yet is placed using that estimate', async () => {
    const courseId = await createCourse(`WKPLAN${Date.now() % 100000}`);
    const deliverableId = await createDeliverable(courseId, 'Exam prep', 5, 120);

    const result = await generateAndPersistWeeklyPlan(client, userId, weekStart, today, { force: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const block = result.data.plan.blocks.find((b) => b.deliverableId === deliverableId);
    expect(block).toBeDefined();
  });

  it('regenerating without force refuses once a block has been adjusted, and force overwrites deliberately', async () => {
    const courseId = await createCourse(`WKPLAN${Date.now() % 100000}`);
    await createDeliverable(courseId, 'Adjust-guard fixture', 4, 60);

    const first = await generateAndPersistWeeklyPlan(client, userId, weekStart, today, { force: true });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const { data: blocks } = await client.from('weekly_plan_blocks').select('id').eq('weekly_plan_id', first.data.planId);
    expect(blocks!.length).toBeGreaterThan(0);
    await client.from('weekly_plan_blocks').update({ status: 'confirmed' }).eq('id', blocks![0]!.id);

    const refused = await generateAndPersistWeeklyPlan(client, userId, weekStart, today);
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.error.code).toBe('conflict');

    // The confirmed adjustment survives the refusal.
    const { data: stillThere } = await client.from('weekly_plan_blocks').select('status').eq('id', blocks![0]!.id).single();
    expect(stillThere!.status).toBe('confirmed');

    const forced = await generateAndPersistWeeklyPlan(client, userId, weekStart, today, { force: true });
    expect(forced.ok).toBe(true);
    if (!forced.ok) return;
    expect(forced.data.planId).not.toBe(first.data.planId); // the old plan row was replaced, not reused
  });

  it('a busy calendar event blocks that time from being used for a suggested focus block', async () => {
    const courseId = await createCourse(`WKPLAN${Date.now() % 100000}`);
    const deliverableId = await createDeliverable(courseId, 'Busy-day fixture', 2, 60);

    // Occupy the entire real local waking window for `today` -- generateAndPersistWeeklyPlan
    // resolves 8am-11pm LOCAL to real UTC instants via localTimeToInstant, so the fixture
    // must use the same conversion rather than naive UTC clock times (which don't line up
    // with the actual local window once the timezone offset is applied).
    const windowStart = localTimeToInstant(today, 8, 0, TIMEZONE);
    const windowEnd = localTimeToInstant(today, 23, 0, TIMEZONE);
    const { error: eventError } = await client
      .from('calendar_events')
      .insert({ user_id: userId, title: 'All-day block', start_at: windowStart, end_at: windowEnd, is_busy: true, source: 'manual' });
    expect(eventError).toBeNull();

    const result = await generateAndPersistWeeklyPlan(client, userId, weekStart, today, { force: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const blockToday = result.data.plan.blocks.find((b) => b.deliverableId === deliverableId && b.date === today);
    expect(blockToday).toBeUndefined(); // today is fully busy -- must not overlap the calendar event
  });
});

describe('getWeeklyPlan / updateWeeklyPlanBlockStatus', () => {
  let client: TypedSupabaseClient;
  let userId: string;
  let today: string;
  let weekStart: string;

  beforeAll(async () => {
    const email = `itest-weeklyplan-read-${Date.now()}@collegeos.test`;
    const password = 'itest-weeklyplan-password-1';
    const user = await createConfirmedUser(email, password);
    userId = user.id;

    client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY!);
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    today = getUserLocalToday(TIMEZONE);
    weekStart = today;

    const reviewRows = Array.from({ length: 5 }, (_, i) => ({
      user_id: userId,
      local_date: addDays(today, -(i + 1)),
      deep_work_actual_min: 180,
    }));
    const { error: reviewError } = await client.from('daily_reviews').insert(reviewRows);
    if (reviewError) throw reviewError;
  });

  it('returns null for a week that has never been generated', async () => {
    const result = await getWeeklyPlan(client, userId, addDays(weekStart, 70), today);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toBeNull();
  });

  it('resolves deliverable titles, course codes, highest-risk ranking and per-course allocation live -- none of it read back off the row', async () => {
    const { data: course, error: courseError } = await client
      .from('courses')
      .insert({ user_id: userId, code: `WKREAD${Date.now() % 100000}`, name: 'Read-path fixture', term: 'Fall 2026' })
      .select('id, code')
      .single();
    expect(courseError).toBeNull();
    const courseId = course!.id;

    const dueDate = addDays(today, 4);
    const { data: deliverable, error: deliverableError } = await client
      .from('deliverables')
      .insert({ user_id: userId, course_id: courseId, title: 'Read-path deliverable', type: 'problem_set', due_at: `${dueDate}T23:59:00Z`, local_due_date: dueDate, estimated_minutes: 90 })
      .select('id')
      .single();
    expect(deliverableError).toBeNull();
    const deliverableId = deliverable!.id;

    const generated = await generateAndPersistWeeklyPlan(client, userId, weekStart, today, { force: true });
    expect(generated.ok).toBe(true);
    if (!generated.ok) return;

    const result = await getWeeklyPlan(client, userId, weekStart, today);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).not.toBeNull();
    const plan = result.data!;

    expect(plan.weekStartDate).toBe(weekStart);
    const block = plan.blocks.find((b) => b.deliverableId === deliverableId);
    expect(block).toBeDefined();
    expect(block!.title).toBe('Read-path deliverable');
    expect(block!.courseCode).toBe(course!.code);

    const risky = plan.highestRisk.find((r) => r.deliverableId === deliverableId);
    expect(risky).toBeDefined();
    expect(risky!.title).toBe('Read-path deliverable');

    const allocation = plan.courseAllocations.find((a) => a.courseId === courseId);
    expect(allocation).toBeDefined();
    expect(allocation!.minutesAllocated).toBeGreaterThan(0);
  });

  it('updateWeeklyPlanBlockStatus changes only the targeted block and is scoped to the owning user', async () => {
    const { data: course } = await client
      .from('courses')
      .insert({ user_id: userId, code: `WKSTAT${Date.now() % 100000}`, name: 'Status fixture', term: 'Fall 2026' })
      .select('id')
      .single();
    const dueDate = addDays(today, 4);
    await client
      .from('deliverables')
      .insert({ user_id: userId, course_id: course!.id, title: 'Status fixture deliverable', type: 'problem_set', due_at: `${dueDate}T23:59:00Z`, local_due_date: dueDate, estimated_minutes: 60 });

    const generated = await generateAndPersistWeeklyPlan(client, userId, weekStart, today, { force: true });
    expect(generated.ok).toBe(true);
    if (!generated.ok) return;

    const { data: blocks } = await client.from('weekly_plan_blocks').select('id, status').eq('weekly_plan_id', generated.data.planId);
    expect(blocks!.length).toBeGreaterThan(0);
    const targetBlockId = blocks![0]!.id;

    const wrongUserResult = await updateWeeklyPlanBlockStatus(client, '00000000-0000-0000-0000-000000000000', targetBlockId, 'confirmed');
    expect(wrongUserResult.ok).toBe(true); // no error -- just zero rows matched, same as every other user_id-scoped update
    const { data: unchanged } = await client.from('weekly_plan_blocks').select('status').eq('id', targetBlockId).single();
    expect(unchanged!.status).toBe('suggested');

    const result = await updateWeeklyPlanBlockStatus(client, userId, targetBlockId, 'confirmed');
    expect(result.ok).toBe(true);
    const { data: changed } = await client.from('weekly_plan_blocks').select('status').eq('id', targetBlockId).single();
    expect(changed!.status).toBe('confirmed');
  });
});
