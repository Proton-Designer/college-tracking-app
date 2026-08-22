import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { signIn } from '../auth/auth';
import { getAgentReport, listAgentReports } from '../data/agentReports';
import { getDailySummary, getWeeklySummary, listRecentDailySummaries } from '../data/summaries';
import { listActiveInsights } from '../data/insights';
import { DEMO_EMAIL, DEMO_PASSWORD, SUPABASE_ANON_KEY, SUPABASE_URL } from './testSupport';
import type { Database } from '../database.types';
import type { TypedSupabaseClient } from '../client/types';

// Read-only against demo -- proves the thin read layer Nova's /review UI needs for
// agent_reports/daily_summaries/weekly_summaries, against the real rows seed.sql
// already plants there.
describe('agent report and summary pyramid reads', () => {
  let client: TypedSupabaseClient;

  beforeAll(async () => {
    client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY!);
    const result = await signIn(client, { email: DEMO_EMAIL, password: DEMO_PASSWORD });
    expect(result.ok).toBe(true);
  });

  it('getAgentReport reads the seeded nightly report by its anchor date; a date with no report is null, not an error', async () => {
    // seed.sql plants this row at `current_date - 1` AT SEED TIME, a frozen snapshot,
    // not a live value -- it only matches real wall-clock "yesterday" immediately after
    // a fresh db reset. Query the row's own local_date directly rather than assuming
    // `new Date()` still lines up with whenever the DB was last reset (same fix as
    // dayView.itest.ts's Recovery Mode tests, same root cause).
    const { data: mostRecent, error: mostRecentError } = await client
      .from('agent_reports')
      .select('local_date')
      .eq('report_type', 'nightly')
      .order('local_date', { ascending: false })
      .limit(1)
      .single();
    expect(mostRecentError).toBeNull();
    const localDate = mostRecent!.local_date;

    const result = await getAgentReport(client, 'nightly', localDate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).not.toBeNull();
    expect(result.data!.report_type).toBe('nightly');
    // `headline` lives under `deterministic` (packages/core's NightlyAgentReportPayload
    // shape, unified this session) -- this assertion used to check a top-level
    // `headline`, a leftover from before the type-unification pass moved the
    // deterministic-report prose fields under their own key. The payload didn't
    // regress; the assertion was describing the old shape.
    expect(result.data!.payload).toHaveProperty('deterministic.headline');

    const missing = await getAgentReport(client, 'nightly', '2099-01-01');
    expect(missing.ok).toBe(true);
    if (missing.ok) expect(missing.data).toBeNull();
  });

  it('listAgentReports returns nightly reports newest-first', async () => {
    const result = await listAgentReports(client, 'nightly', 10);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.length).toBeGreaterThan(0);
    for (let i = 1; i < result.data.length; i++) {
      expect(result.data[i - 1]!.local_date >= result.data[i]!.local_date).toBe(true);
    }
  });

  it('listRecentDailySummaries returns the seeded 6-day run in chronological order', async () => {
    // Anchored to the seed's own most recent row, not real wall-clock `new Date()` --
    // same reasoning as the nightly-report anchor above: seed.sql's 6-day run
    // (current_date - 6 .. current_date - 1) is a snapshot from whenever the DB was
    // last reset, and drifts out of a real-"today"-relative lookback window the longer
    // it's been since then.
    const { data: mostRecentSummary, error: mostRecentSummaryError } = await client
      .from('daily_summaries')
      .select('local_date')
      .order('local_date', { ascending: false })
      .limit(1)
      .single();
    expect(mostRecentSummaryError).toBeNull();
    const today = mostRecentSummary!.local_date;
    const result = await listRecentDailySummaries(client, today, 14);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.length).toBeGreaterThanOrEqual(6);
    for (let i = 1; i < result.data.length; i++) {
      expect(result.data[i - 1]!.local_date <= result.data[i]!.local_date).toBe(true);
    }
    expect(result.data[result.data.length - 1]!.summary).toHaveProperty('mitsCompleted', 2);
  });

  it('getDailySummary and getWeeklySummary read the exact seeded rows', async () => {
    // The earliest row of the seeded 6-day run, read directly rather than computed as
    // "6 days before real now" -- same anchoring fix as above.
    const { data: earliestSummary, error: earliestSummaryError } = await client
      .from('daily_summaries')
      .select('local_date')
      .order('local_date', { ascending: true })
      .limit(1)
      .single();
    expect(earliestSummaryError).toBeNull();
    const daily = await getDailySummary(client, earliestSummary!.local_date);
    expect(daily.ok).toBe(true);
    if (daily.ok) expect(daily.data).not.toBeNull();

    const { data: weeklyRow } = await client.from('weekly_summaries').select('week_start_date').limit(1).single();
    const weekly = await getWeeklySummary(client, weeklyRow!.week_start_date);
    expect(weekly.ok).toBe(true);
    if (!weekly.ok) return;
    expect(weekly.data).not.toBeNull();
    expect(weekly.data!.summary).toHaveProperty('topRisk', 'PHYS 241 Exam 2');
  });

  it('listActiveInsights reads the seeded active insights, never a code-detected claim with a fake model confidence', async () => {
    const result = await listActiveInsights(client);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.length).toBeGreaterThanOrEqual(2);
    for (const insight of result.data) {
      expect(insight.status).toBe('active');
      // Whenever a claimed confidence exists, code's own gate must never have been
      // exceeded by it -- the clamp LLM_LAYER_SPEC.md §9 requires.
      if (insight.confidence_claimed_by_model !== null) {
        const rank = { testing: 0, medium: 1, high: 2 } as const;
        expect(rank[insight.confidence_stored]).toBeLessThanOrEqual(rank[insight.confidence_claimed_by_model]);
      }
    }
  });
});
