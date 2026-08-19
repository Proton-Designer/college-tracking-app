import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { getNightReviewDraft, submitNightReview } from '../day/submitReview';
import { getPredictionForDate } from '../day/predictions';
import { submitMorningCheckin } from '../day/submitCheckin';
import { createConfirmedUser, SUPABASE_ANON_KEY, SUPABASE_URL } from './testSupport';
import type { Database } from '../database.types';
import type { TypedSupabaseClient } from '../client/types';

// Proves the read/write split the Lead asked for: SCREEN_SPEC §3's night-review preview
// must be visible with ZERO writes, so a user who opens the screen and backs out never
// gets a daily_reviews row persisted or a prediction scored as though they'd reflected.
// "Skipping is always available" must actually cost nothing.
//
// Writes real tasks/sessions/checkins/reviews -- dedicated throwaway user, not demo
// (same "reads against demo, writes against a throwaway" line every write-heavy itest
// in this file draws).
describe('night review draft: a read that exists independently of the write', () => {
  let client: TypedSupabaseClient;
  let userId: string;
  const localDate = new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    const email = `itest-nightdraft-${Date.now()}@collegeos.test`;
    const password = 'itest-nightdraft-password-1';
    const user = await createConfirmedUser(email, password);
    userId = user.id;

    client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY!);
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;

    // One MIT task, completed, so mitsPlanned/mitsCompleted have real signal.
    const { data: task, error } = await client
      .from('tasks')
      .insert({
        user_id: userId,
        title: 'night-draft-test-task',
        category: 'testing',
        estimated_minutes: 30,
        planned_date: localDate,
        status: 'completed',
        mit_rank: 1,
      })
      .select('id')
      .single();
    if (error) throw error;

    const { error: sessionError } = await client.from('task_sessions').insert({
      task_id: task.id,
      user_id: userId,
      status: 'completed',
      planned_duration_min: 25,
      actual_duration_min: 30,
      planned_start: new Date().toISOString(),
      actual_start: new Date().toISOString(),
    });
    if (sessionError) throw sessionError;
  });

  it('getNightReviewDraft computes the same numbers submitNightReview would persist -- with zero writes', async () => {
    const draft = await getNightReviewDraft(client, userId, localDate);
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    expect(draft.data.mitsPlanned).toBe(1);
    expect(draft.data.mitsCompleted).toBe(1);
    expect(draft.data.deepWorkPlannedMin).toBe(25);
    expect(draft.data.deepWorkActualMin).toBe(30);

    // The defining assertion: previewing must not have written anything. No review row,
    // no scored prediction -- calling the read path alone must be completely inert.
    const { data: reviewRow } = await client
      .from('daily_reviews')
      .select('id')
      .eq('user_id', userId)
      .eq('local_date', localDate)
      .maybeSingle();
    expect(reviewRow).toBeNull();

    const submitted = await submitNightReview(client, { userId, localDate, wentWrongText: 'ran long on task 2' });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    // The preview and the persisted write must agree exactly -- same underlying
    // computation, not two implementations that could silently drift.
    expect(submitted.data.mits_planned).toBe(draft.data.mitsPlanned);
    expect(submitted.data.mits_completed).toBe(draft.data.mitsCompleted);
    expect(submitted.data.deep_work_planned_min).toBe(draft.data.deepWorkPlannedMin);
    expect(submitted.data.deep_work_actual_min).toBe(draft.data.deepWorkActualMin);

    // Calling the draft again after submission still recomputes fresh (not a read of the
    // stored review row) -- it should agree, since nothing about that day's data changed.
    const draftAfter = await getNightReviewDraft(client, userId, localDate);
    expect(draftAfter.ok).toBe(true);
    if (draftAfter.ok) expect(draftAfter.data).toEqual(draft.data);
  });

  it('getPredictionForDate reads the morning prediction without needing scorePredictionForDate to have run', async () => {
    const predictedDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10); // tomorrow, unused by other tests

    const beforeCheckin = await getPredictionForDate(client, userId, predictedDate);
    expect(beforeCheckin.ok).toBe(true);
    if (beforeCheckin.ok) expect(beforeCheckin.data).toBeNull();

    const checkin = await submitMorningCheckin(client, {
      userId,
      localDate: predictedDate,
      energy: 7,
      mood: 6,
      predictedCompletionPct: 80,
      topMitTaskIds: [],
    });
    expect(checkin.ok).toBe(true);

    const afterCheckin = await getPredictionForDate(client, userId, predictedDate);
    expect(afterCheckin.ok).toBe(true);
    if (!afterCheckin.ok) return;
    expect(afterCheckin.data).not.toBeNull();
    expect(afterCheckin.data!.predicted_completion_pct).toBe(80);
    // Not yet scored -- that only happens when a night review runs for that date.
    expect(afterCheckin.data!.actual_completion_pct).toBeNull();
  });
});
