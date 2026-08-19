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
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const localDate = yesterday.toISOString().slice(0, 10);

    const result = await getAgentReport(client, 'nightly', localDate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).not.toBeNull();
    expect(result.data!.report_type).toBe('nightly');
    expect(result.data!.payload).toHaveProperty('headline');

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
    const today = new Date().toISOString().slice(0, 10);
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
    const sixDaysAgo = new Date();
    sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);
    const daily = await getDailySummary(client, sixDaysAgo.toISOString().slice(0, 10));
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
