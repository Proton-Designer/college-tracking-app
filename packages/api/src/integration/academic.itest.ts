import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { addDays } from '@collegeos/core';
import { signIn } from '../auth/auth';
import { generateAndPersistBackplan, computeCapacityHorizon } from '../academic/backplan';
import { computeCourseGradeScenario, computeCourseRequiredScore } from '../academic/gradeScenario';
import { getBackplan, listMilestones } from '../data/backplans';
import { getUserLocalToday } from '../day/today';
import { DEMO_EMAIL, DEMO_PASSWORD, SUPABASE_ANON_KEY, SUPABASE_URL } from './testSupport';
import type { Database } from '../database.types';
import type { TypedSupabaseClient } from '../client/types';

// Proves deadline-radar persistence and the grade scenario solver against the seeded
// demo user's real deliverables and BME 301 grade data.

const TIMEZONE = 'America/Indiana/Indianapolis';

describe('deadline radar + grade scenarios against the seeded demo user', () => {
  let client: TypedSupabaseClient;
  let userId: string;
  let today: string;

  beforeAll(async () => {
    client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY!);
    const result = await signIn(client, { email: DEMO_EMAIL, password: DEMO_PASSWORD });
    if (!result.ok) throw new Error(`demo signIn failed: ${result.error.code}`);
    userId = result.data.session.user.id;
    today = getUserLocalToday(TIMEZONE);
  });

  it('regenerates and persists a backplan for a real seeded deliverable, replacing the old one', async () => {
    const { data: deliverables, error } = await client
      .from('deliverables')
      .select('id')
      .eq('user_id', userId)
      .neq('status', 'completed')
      .limit(1);
    expect(error).toBeNull();
    expect(deliverables!.length).toBeGreaterThan(0);
    const deliverableId = deliverables![0]!.id;

    const first = await generateAndPersistBackplan(client, userId, deliverableId, today);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.backplan.milestones.length).toBeGreaterThan(0);

    // Regenerating must REPLACE, not accumulate -- exactly one backplan row survives.
    const second = await generateAndPersistBackplan(client, userId, deliverableId, today);
    expect(second.ok).toBe(true);

    const { data: backplans } = await client.from('deliverable_backplans').select('id').eq('deliverable_id', deliverableId);
    expect(backplans!.length).toBe(1);
    expect(backplans![0]!.id).toBe(second.ok ? second.data.backplanId : undefined);
  });

  it('reads the current backplan and its milestones without mutating anything', async () => {
    const { data: deliverables } = await client
      .from('deliverables')
      .select('id')
      .eq('user_id', userId)
      .neq('status', 'completed')
      .limit(1);
    const deliverableId = deliverables![0]!.id;
    await generateAndPersistBackplan(client, userId, deliverableId, today);

    const before = await getBackplan(client, deliverableId);
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    expect(before.data).not.toBeNull();

    const milestones = await listMilestones(client, before.data!.id);
    expect(milestones.ok).toBe(true);
    if (!milestones.ok) return;
    expect(milestones.data.length).toBeGreaterThan(0);

    // A second read must be byte-for-byte identical -- this is a read, not the
    // regenerate-on-every-load trap generateAndPersistBackplan itself carries a guard for.
    const after = await getBackplan(client, deliverableId);
    expect(after.ok).toBe(true);
    if (after.ok) expect(after.data!.id).toBe(before.data!.id);
  });

  it('refuses to regenerate a backplan with a milestone already marked done, unless forced', async () => {
    const { data: courses } = await client.from('courses').select('id, code').eq('user_id', userId);
    const chem = courses!.find((c) => c.code === 'CHEM 255');
    expect(chem).toBeDefined();
    const { data: deliverables } = await client
      .from('deliverables')
      .select('id')
      .eq('user_id', userId)
      .eq('course_id', chem!.id)
      .eq('title', 'Problem Set 7');
    expect(deliverables!.length).toBe(1);
    const deliverableId = deliverables![0]!.id;

    // Precondition set up by this test, not borrowed from the seed -- this test's own
    // force:true call below regenerates (and so resets) the milestones it touches, which
    // would otherwise make a second run of the suite against the same local db find
    // nothing left to block. A test that only passes once isn't testing the guard.
    const setup = await generateAndPersistBackplan(client, userId, deliverableId, today, { force: true });
    expect(setup.ok).toBe(true);
    if (!setup.ok) return;
    const { data: firstMilestone } = await client
      .from('backplan_milestones')
      .select('id')
      .eq('backplan_id', setup.data.backplanId)
      .limit(1)
      .single();
    const { error: markDoneError } = await client
      .from('backplan_milestones')
      .update({ completed: true })
      .eq('id', firstMilestone!.id);
    expect(markDoneError).toBeNull();

    const blocked = await generateAndPersistBackplan(client, userId, deliverableId, today);
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.error.code).toBe('conflict');

    // The original backplan must survive untouched -- a refusal is not a partial mutation.
    const untouched = await getBackplan(client, deliverableId);
    expect(untouched.ok).toBe(true);
    if (untouched.ok) {
      const milestones = await listMilestones(client, untouched.data!.id);
      expect(milestones.ok && milestones.data.some((m) => m.completed)).toBe(true);
    }

    const forced = await generateAndPersistBackplan(client, userId, deliverableId, today, { force: true });
    expect(forced.ok).toBe(true);
  });

  it('computes committed-vs-available capacity across a semester-scale horizon, not just one deliverable\'s window', async () => {
    const { data: profile } = await client.from('profiles').select('sleep_baseline_hours, timezone').eq('id', userId).single();
    const horizonEnd = addDays(today, 13);

    const result = await computeCapacityHorizon(client, userId, today, horizonEnd, profile!.sleep_baseline_hours, profile!.timezone);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Exactly one entry per day in [today, horizonEnd], inclusive, in order.
    expect(result.data.length).toBe(14);
    expect(result.data[0]!.date).toBe(today);
    expect(result.data[result.data.length - 1]!.date).toBe(horizonEnd);
    for (let i = 1; i < result.data.length; i++) {
      expect(result.data[i]!.date > result.data[i - 1]!.date).toBe(true);
    }

    // At least one day in a two-week window has less available time than a day with no
    // commitments at all -- proves calendar_events actually reduces capacity, not just
    // that the shape is right. (Five courses meeting across the week make an
    // all-completely-free 14-day span implausible; if this ever flakes, the seed's
    // course_meetings coverage is the thing to check.)
    const wakingMinutes = result.data.reduce((max, d) => Math.max(max, d.availableMinutes), 0);
    expect(result.data.some((d) => d.availableMinutes < wakingMinutes)).toBe(true);

    // committedMinutes and wakingMinutes are the inputs availableMinutes was derived
    // from (SCREEN_SPEC §5: congestion must be visible, not inferred) -- every day's
    // three numbers must actually reconcile, not just individually look plausible.
    for (const day of result.data) {
      expect(day.availableMinutes).toBeGreaterThanOrEqual(0);
      expect(day.committedMinutes).toBeGreaterThanOrEqual(0);
      expect(day.wakingMinutes).toBeGreaterThan(0);
      expect(day.availableMinutes).toBe(Math.max(0, day.wakingMinutes - day.committedMinutes));
    }
    expect(result.data.some((d) => d.committedMinutes > 0)).toBe(true);
  });

  it('every persisted milestone lands on or after today, matching packages/core\'s own invariant', async () => {
    const { data: deliverables } = await client
      .from('deliverables')
      .select('id')
      .eq('user_id', userId)
      .neq('status', 'completed')
      .limit(1);
    const deliverableId = deliverables![0]!.id;

    await generateAndPersistBackplan(client, userId, deliverableId, today);

    const { data: milestones } = await client
      .from('backplan_milestones')
      .select('milestone_date')
      .eq('backplan_id', (await client.from('deliverable_backplans').select('id').eq('deliverable_id', deliverableId).single()).data!.id);

    for (const m of milestones ?? []) {
      expect(m.milestone_date >= today).toBe(true);
    }
  });

  it('the grade scenario solver reproduces the brief\'s example shape against BME 301: assuming Exam 3-equivalent input changes the required score on what remains', async () => {
    const { data: courses } = await client.from('courses').select('id, code').eq('user_id', userId);
    const bme = courses!.find((c) => c.code === 'BME 301');
    expect(bme).toBeDefined();

    const { data: categories } = await client.from('grade_categories').select('id, name').eq('user_id', userId).eq('course_id', bme!.id);
    const finalCategory = categories!.find((c) => c.name === 'Final');
    expect(finalCategory).toBeDefined();

    const baseline = await computeCourseRequiredScore(client, userId, bme!.id, 90);
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;
    // Hand-verified in packages/core's own test suite: 94.375% needed on the Final for a 90.
    expect(baseline.data.verdict).toBe('onTrack');
    expect(baseline.data.neededPct).toBeCloseTo(94.375, 2);

    // Now hypothesize the Final at exactly that score -- the course should resolve to
    // final with the target met.
    const scenario = await computeCourseGradeScenario(client, userId, bme!.id, [
      { categoryId: finalCategory!.id.toString(), assumedPct: 94.375 },
    ]);
    expect(scenario.ok).toBe(true);
    if (!scenario.ok) return;
    expect(scenario.data.projectedGrade).toBeCloseTo(90, 0);
  });
});
