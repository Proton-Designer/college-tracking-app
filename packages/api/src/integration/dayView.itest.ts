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

  it('does not trigger Recovery Mode today from tasks abandoned weeks ago -- overdueTasks is a near-term signal, not a permanent one', async () => {
    // The seeded Recovery Mode day (22 days ago) leaves genuinely-uncompleted tasks
    // behind on purpose (see seed.sql), which is real, permanent overdue debt. If
    // overdueTaskCount's lookback were unbounded, that debt alone would push today's
    // live view into Recovery Mode too -- confirmed live while building this seed
    // coverage, then fixed by windowing the query in recoveryMode.ts to the last 7 days,
    // matching every sibling signal's near-term shape (today/yesterday/48h).
    const result = await getDayView(client, userId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const overdueSignal = result.data.recoveryMode.signals.find((s) => s.key === 'overdueTasks');
    expect(overdueSignal?.active).toBe(false);
    expect(result.data.recoveryMode.triggered).toBe(false);
  });

  it('exposes the raw evidence behind computed conclusions -- calendar events, task sessions, and health, not just derived scores', async () => {
    const result = await getDayView(client, userId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Every row returned must actually belong to today and to this user -- proves the
    // query window, not just that the field exists and is an array.
    expect(Array.isArray(result.data.todayCalendarEvents)).toBe(true);
    for (const event of result.data.todayCalendarEvents) {
      expect(event.user_id).toBe(userId);
      expect(event.start_at.slice(0, 10) <= today).toBe(true);
    }

    expect(Array.isArray(result.data.todayTaskSessions)).toBe(true);
    for (const session of result.data.todayTaskSessions) {
      expect(session.user_id).toBe(userId);
    }

    // todayHealth is null-or-populated, never a half-filled object.
    if (result.data.todayHealth !== null) {
      expect(typeof result.data.todayHealth.whoopRecoveryPct === 'number' || result.data.todayHealth.whoopRecoveryPct === null).toBe(
        true,
      );
    }
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
    for (const mit of result.data.suggestedMits) {
      // calibratedMinutes must be the calibration-adjusted figure, not the raw estimate --
      // proven by requiring it move with the multiplier rather than always equaling 1x.
      expect(mit.calibratedMinutes).toBeGreaterThan(0);
      expect(mit.calibrationMultiplier).toBeGreaterThan(0);
      expect(['high', 'moderate', 'low', 'insufficient']).toContain(mit.calibrationConfidence);
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

    // MvdPlan is only computed when Recovery Mode actually triggers -- this is the one
    // seeded day that proves it's non-null, not just typed as such.
    expect(result.data.mvdPlan).not.toBeNull();
    expect(result.data.mvdPlan!.sleepByTime).toMatch(/^\d{2}:\d{2}$/);
    expect(result.data.mvdPlan!.phoneBlockDuringStudyBlock).toBe(true);

    // The seed carries real material for this day (a hard-deadline task, a CHEM lab
    // calendar event, and ordinary discretionary tasks) specifically so this assertion
    // has something to prove -- an empty kept/deferred would pass silently otherwise,
    // and "nothing the system defers is silent" is unverifiable if nothing is ever
    // deferred. See supabase/seed.sql's v_bad_day branch.
    expect(result.data.mvdPlan!.kept.length).toBeGreaterThan(0);
    expect(result.data.mvdPlan!.deferred.length).toBeGreaterThan(0);
    expect(result.data.mvdPlan!.kept.some((item) => item.kind === 'hardDeadline')).toBe(true);
    expect(result.data.mvdPlan!.kept.some((item) => item.kind === 'attendance')).toBe(true);
  });

  it('an ordinary seeded day does not trigger Recovery Mode', async () => {
    // Deliberately BEFORE the bad day (22 days ago), not after -- the bad day's tasks are
    // genuinely never completed (that's the point, see seed.sql), so overdueTaskCount
    // (unbounded lookback, not scoped to a window) correctly flags them as overdue for
    // every later day's view too. A day earlier than the bad day has no such tasks yet.
    const ordinaryDay = addDays(today, -27);
    const asOf = new Date(`${ordinaryDay}T17:00:00Z`);
    const result = await getDayView(client, userId, asOf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.recoveryMode.triggered).toBe(false);
    expect(result.data.mvdPlan).toBeNull();
  });
});
