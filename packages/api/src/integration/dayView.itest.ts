import { createClient } from '@supabase/supabase-js';
import { addDays } from '@collegeos/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { signIn } from '../auth/auth';
import { getDayView } from '../day/dayView';
import { getUserLocalToday } from '../day/today';
import type { Database } from '../database.types';
import type { TypedSupabaseClient } from '../client/types';

// Proves the day-assembly service against the seeded demo user (supabase/seed.sql) --
// engine, DB, and API must all agree on the same hand-verified figures.

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const DEMO_EMAIL = 'demo@collegeos.app';
const DEMO_PASSWORD = 'CollegeOS-Demo-2026';
const TIMEZONE = 'America/Indiana/Indianapolis';

describe('getDayView against the seeded demo user', () => {
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

  it('assembles a full day view for the demo user today', async () => {
    const result = await getDayView(client, userId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.today).toBe(today);
    expect(result.data.profile.id).toBe(userId);
  });

  it('BME 301 projects to the exact hand-verified figure from packages/core\'s own test suite (87.0833%)', async () => {
    const result = await getDayView(client, userId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const bme = result.data.gradeProjections.find(
      (g) => g.result.currentGrade != null && Math.abs(g.result.currentGrade - 87.0833) < 0.5,
    );
    expect(bme).toBeDefined();
    expect(bme!.result.currentGrade).toBeCloseTo(87.0833, 2);
    // assumption='current' -> projectedGrade equals currentGrade when weights sum to 100
    expect(bme!.result.projectedGrade).toBeCloseTo(bme!.result.currentGrade!, 2);
  });

  it('CHEM 255 surfaces the deliberate weight-sum-warning (95%, not silently normalized)', async () => {
    const result = await getDayView(client, userId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const chem = result.data.gradeProjections.find((g) => g.result.weightSum === 95);
    expect(chem).toBeDefined();
    expect(chem!.result.issues.some((i) => i.kind === 'weightSumWarning')).toBe(true);
  });

  it('every deliverable risk carries a non-empty explanation trace (the UI\'s "Why:")', async () => {
    const result = await getDayView(client, userId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.risk.deliverableRisks.length).toBeGreaterThan(0);
    for (const dr of result.data.risk.deliverableRisks) {
      expect(dr.result.trace.length).toBeGreaterThan(0);
      const summed = dr.result.trace.reduce((s, t) => s + t.contribution, 0);
      expect(Math.abs(summed - dr.result.score)).toBeLessThan(2);
    }
  });

  it('suggests at most 3 MITs, ranked by risk reduction per calibrated minute, highest first', async () => {
    const result = await getDayView(client, userId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.suggestedMits.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < result.data.suggestedMits.length; i++) {
      expect(result.data.suggestedMits[i - 1]!.riskReductionPerMinute).toBeGreaterThanOrEqual(
        result.data.suggestedMits[i]!.riskReductionPerMinute,
      );
    }
  });

  it('the seeded Recovery Mode day (22 days ago: 4.2h sleep, 28% WHOOP recovery) actually triggers Recovery Mode through the full stack', async () => {
    const recoveryDayLocalDate = addDays(today, -22);
    // 17:00 UTC is comfortably mid-afternoon in America/Indiana/Indianapolis regardless
    // of DST, so this resolves to exactly recoveryDayLocalDate.
    const asOf = new Date(`${recoveryDayLocalDate}T17:00:00Z`);
    expect(getUserLocalToday(TIMEZONE, asOf)).toBe(recoveryDayLocalDate);

    const result = await getDayView(client, userId, asOf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const signalsByKey = Object.fromEntries(result.data.recoveryMode.signals.map((s) => [s.key, s]));
    expect(signalsByKey.lowSleep?.active).toBe(true);
    expect(signalsByKey.lowWhoopRecovery?.active).toBe(true);
    // The anti-excuse invariant, proven live: physiology alone (lowSleep + lowWhoopRecovery
    // = 3 points) cannot reach the threshold. This day trips it BECAUSE a real
    // non-physiological signal is also active, not despite the invariant.
    expect(result.data.recoveryMode.physiologicalTotal).toBeLessThan(5);
    expect(result.data.recoveryMode.nonPhysiologicalTotal).toBeGreaterThan(0);
    expect(result.data.recoveryMode.triggered).toBe(true);
  });

  it('an ordinary seeded day does not trigger Recovery Mode', async () => {
    const ordinaryDay = addDays(today, -10);
    const asOf = new Date(`${ordinaryDay}T17:00:00Z`);
    const result = await getDayView(client, userId, asOf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.recoveryMode.triggered).toBe(false);
  });
});
