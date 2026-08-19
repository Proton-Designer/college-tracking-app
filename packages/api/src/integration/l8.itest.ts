import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createExperiment,
  getExperiment,
  getExperimentOutcome,
  listExperiments,
  logExperimentMeasurement,
  listExperimentMeasurements,
  scoreExperiment,
} from '../data/experiments';
import { logDecision, scoreDecision, getDecision, listDecisions } from '../data/decisionJournal';
import { createSemesterLesson, listSemesterLessons, listSemesterLessonsForTerm } from '../data/semesterLessons';
import { createConfirmedUser, SUPABASE_ANON_KEY, SUPABASE_URL } from './testSupport';
import type { Database } from '../database.types';
import type { TypedSupabaseClient } from '../client/types';

// L8: experiments (observe -> hypothesize -> N-of-1 trial -> measure), decision
// journal, and durable semester lessons. Dedicated throwaway user, not demo -- "reads
// against demo, writes against a throwaway" applies here too.
describe('L8: experiments, decision journal, semester lessons', () => {
  let client: TypedSupabaseClient;
  let userId: string;

  beforeAll(async () => {
    const email = `itest-l8-${Date.now()}@collegeos.test`;
    const password = 'itest-l8-password-1';
    const user = await createConfirmedUser(email, password);
    userId = user.id;

    client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY!);
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
  });

  describe('experiments', () => {
    it('converts a testing-tier insight into a running N-of-1 trial, logs measurements, and closes it out', async () => {
      const { data: insight, error: insightError } = await client
        .from('insights')
        .insert({
          user_id: userId,
          claim: 'Social-media relapses cluster right after a hard problem set question.',
          confidence_stored: 'testing',
          sample_size: 6,
          status: 'active',
        })
        .select('id')
        .single();
      expect(insightError).toBeNull();

      const created = await createExperiment(client, userId, {
        insightId: insight!.id,
        hypothesis: 'A 2-minute walk after getting stuck will reduce same-session relapses.',
        protocol: 'For 7 days: on getting stuck, take a 2-minute walk before returning to the phone.',
        startDate: '2026-08-01',
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      expect(created.data.status).toBe('running');
      expect(created.data.insight_id).toBe(insight!.id);

      const fetched = await getExperiment(client, created.data.id);
      expect(fetched.ok).toBe(true);
      if (fetched.ok) expect(fetched.data?.hypothesis).toContain('2-minute walk');

      const running = await listExperiments(client, 'running');
      expect(running.ok).toBe(true);
      if (running.ok) expect(running.data.some((e) => e.id === created.data.id)).toBe(true);

      for (const [i, value] of [1, 0, 1, 0, 0].entries()) {
        const logged = await logExperimentMeasurement(client, userId, {
          experimentId: created.data.id,
          metric: 'relapses_after_stuck',
          value,
          localDate: `2026-08-0${i + 2}`,
        });
        expect(logged.ok).toBe(true);
      }

      const measurements = await listExperimentMeasurements(client, created.data.id);
      expect(measurements.ok).toBe(true);
      if (measurements.ok) {
        expect(measurements.data.length).toBe(5);
        expect(measurements.data[0]!.local_date).toBe('2026-08-02'); // ordered by local_date
      }

      const scored = await scoreExperiment(client, created.data.id, {
        status: 'completed',
        outcomeSummary: 'Relapse rate dropped from a 2/day baseline to 0.4/day across the trial.',
        endDate: '2026-08-07',
      });
      expect(scored.ok).toBe(true);
      if (!scored.ok) return;
      expect(scored.data.experiment.status).toBe('completed');
      expect(scored.data.experiment.outcome_summary).toContain('0.4/day');
      // No baseline_value/hypothesized_direction were set on this trial -- a real
      // verdict genuinely cannot be computed, and the result says so honestly rather
      // than fabricating one from the human-written summary text.
      expect(scored.data.outcome).toBeNull();
      expect(scored.data.experiment.end_date).toBe('2026-08-07');

      // No longer shows up in the running list once closed.
      const runningAfter = await listExperiments(client, 'running');
      expect(runningAfter.ok).toBe(true);
      if (runningAfter.ok) expect(runningAfter.data.some((e) => e.id === created.data.id)).toBe(false);
    });

    it('computes a real outcome verdict once baseline_value and hypothesized_direction are set -- the engine getting a real caller', async () => {
      const { data: insight, error: insightError } = await client
        .from('insights')
        .insert({
          user_id: userId,
          claim: 'Late-night study sessions run short.',
          confidence_stored: 'testing',
          sample_size: 6,
          status: 'active',
        })
        .select('id')
        .single();
      expect(insightError).toBeNull();

      const created = await createExperiment(client, userId, {
        insightId: insight!.id,
        hypothesis: 'Studying before 9pm increases session length.',
        startDate: '2026-08-10',
        baselineValue: 30, // baseline: 30-minute average session length
        hypothesizedDirection: 'increase',
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      expect(created.data.baseline_value).not.toBeNull();
      expect(Number(created.data.baseline_value)).toBe(30);
      expect(created.data.hypothesized_direction).toBe('increase');

      // Before any measurements are logged, there isn't enough data for a verdict yet --
      // null, not a fabricated early guess.
      const tooEarly = await getExperimentOutcome(client, created.data.id);
      expect(tooEarly.ok).toBe(true);
      if (tooEarly.ok) expect(tooEarly.data).toBeNull();

      // Consistently above the 30-minute baseline, matching the hypothesized direction.
      for (const [i, value] of [45, 50, 48, 55].entries()) {
        const logged = await logExperimentMeasurement(client, userId, {
          experimentId: created.data.id,
          metric: 'session_length_min',
          value,
          localDate: `2026-08-1${i + 1}`,
        });
        expect(logged.ok).toBe(true);
      }

      const liveOutcome = await getExperimentOutcome(client, created.data.id);
      expect(liveOutcome.ok).toBe(true);
      if (!liveOutcome.ok) return;
      expect(liveOutcome.data).not.toBeNull();
      expect(liveOutcome.data!.measurementCount).toBe(4);
      expect(liveOutcome.data!.baselineValue).toBe(30);
      expect(liveOutcome.data!.movedInHypothesizedDirection).toBe(true);
      expect(liveOutcome.data!.percentChange).toBeGreaterThan(0);

      const scored = await scoreExperiment(client, created.data.id, {
        status: 'completed',
        outcomeSummary: 'Session length rose from a 30-minute baseline once study time moved earlier.',
        endDate: '2026-08-14',
      });
      expect(scored.ok).toBe(true);
      if (!scored.ok) return;
      // scoreExperiment returns the SAME real verdict getExperimentOutcome does -- one
      // round trip for the close-and-see-the-result flow, not two separate calls.
      expect(scored.data.outcome).not.toBeNull();
      expect(scored.data.outcome!.movedInHypothesizedDirection).toBe(true);
    });
  });

  describe('decision journal', () => {
    it('logs a prediction and scores it later, same observe-then-score pattern as daily_predictions', async () => {
      const logged = await logDecision(client, userId, {
        decision: "Skip tonight's review session and sleep instead",
        rationale: "I'll retain more studying fresh tomorrow than grinding exhausted tonight.",
        predictionPct: 75,
        predictedOutcome: 'Wake up and finish the review before the 9am lecture',
      });
      expect(logged.ok).toBe(true);
      if (!logged.ok) return;
      expect(logged.data.scored_at).toBeNull();
      // The trigger, not this function, computed the real local_date.
      expect(logged.data.local_date).not.toBe('1970-01-01');

      const unscored = await listDecisions(client, { unscoredOnly: true });
      expect(unscored.ok).toBe(true);
      if (unscored.ok) expect(unscored.data.some((d) => d.id === logged.data.id)).toBe(true);

      const scored = await scoreDecision(client, logged.data.id, {
        actualOutcome: 'Overslept and reviewed during lunch instead',
      });
      expect(scored.ok).toBe(true);
      if (scored.ok) {
        expect(scored.data.actual_outcome).toContain('Overslept');
        expect(scored.data.scored_at).not.toBeNull();
      }

      const unscoredAfter = await listDecisions(client, { unscoredOnly: true });
      expect(unscoredAfter.ok).toBe(true);
      if (unscoredAfter.ok) expect(unscoredAfter.data.some((d) => d.id === logged.data.id)).toBe(false);

      const fetched = await getDecision(client, logged.data.id);
      expect(fetched.ok).toBe(true);
      if (fetched.ok) expect(fetched.data?.decision).toContain('Skip');
    });
  });

  describe('semester lessons', () => {
    it('records a durable lesson and reads it back, scoped and unscoped by term', async () => {
      const created = await createSemesterLesson(client, userId, {
        term: 'Fall 2026',
        lesson: 'Morning check-in question #7 produced no actionable insight for 4 straight weeks -- retire it.',
        confidence: 'medium',
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      expect(created.data.confidence).toBe('medium');

      const all = await listSemesterLessons(client);
      expect(all.ok).toBe(true);
      if (all.ok) expect(all.data.some((l) => l.id === created.data.id)).toBe(true);

      const forTerm = await listSemesterLessonsForTerm(client, 'Fall 2026');
      expect(forTerm.ok).toBe(true);
      if (forTerm.ok) expect(forTerm.data.some((l) => l.id === created.data.id)).toBe(true);

      const forWrongTerm = await listSemesterLessonsForTerm(client, 'Spring 2027');
      expect(forWrongTerm.ok).toBe(true);
      if (forWrongTerm.ok) expect(forWrongTerm.data.some((l) => l.id === created.data.id)).toBe(false);

      // Append-only: no update/delete RLS policy on semester_lessons -- RLS with no
      // matching policy doesn't error the DELETE statement, it just filters every row
      // out from under it, so the real proof is that the row still exists afterward,
      // not that the call itself throws.
      const { error: deleteError, count } = await client
        .from('semester_lessons')
        .delete({ count: 'exact' })
        .eq('id', created.data.id);
      expect(deleteError).toBeNull();
      expect(count).toBe(0);
      const stillThere = await listSemesterLessonsForTerm(client, 'Fall 2026');
      expect(stillThere.ok).toBe(true);
      if (stillThere.ok) expect(stillThere.data.some((l) => l.id === created.data.id)).toBe(true);
    });
  });
});
