import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { signIn } from '../auth/auth';
import { generateAndPersistBackplan } from '../academic/backplan';
import { computeCourseGradeScenario, computeCourseRequiredScore } from '../academic/gradeScenario';
import { getUserLocalToday } from '../day/today';
import type { Database } from '../database.types';
import type { TypedSupabaseClient } from '../client/types';

// Proves deadline-radar persistence and the grade scenario solver against the seeded
// demo user's real deliverables and BME 301 grade data.

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const DEMO_EMAIL = 'demo@collegeos.app';
const DEMO_PASSWORD = 'CollegeOS-Demo-2026';
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
