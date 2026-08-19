import { createClient } from '@supabase/supabase-js';
import { addDays } from '@collegeos/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { createKillHabit, deactivateKillHabit, listKillHabits } from '../data/killHabits';
import { logKillEvent, listKillEvents } from '../data/killEvents';
import { computeHabitBounceBack } from '../day/killLoopBounceBack';
import { getUserLocalToday } from '../day/today';
import { createConfirmedUser, SUPABASE_ANON_KEY, SUPABASE_URL } from './testSupport';
import type { Database } from '../database.types';
import type { TypedSupabaseClient } from '../client/types';

const TIMEZONE = 'America/Indiana/Indianapolis';

// Dedicated throwaway user, not demo -- these tests create/deactivate real kill_habits
// and log real kill_events. "Reads against demo, writes against a throwaway" (same line
// focusSessions.itest.ts already draws) -- demo's value is its stable, curated data, and
// every write to it degrades that for anyone using it for screenshots or manual review.
describe('the Kill Loop against a dedicated throwaway user', () => {
  let client: TypedSupabaseClient;
  let userId: string;
  let today: string;

  beforeAll(async () => {
    const email = `itest-killloop-${Date.now()}@collegeos.test`;
    const password = 'itest-killloop-password-1';
    const user = await createConfirmedUser(email, password);
    userId = user.id;

    client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY!);
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    today = getUserLocalToday(TIMEZONE);
  });

  it('creates a habit carrying the brief\'s full chain, including the single implementation intention', async () => {
    const created = await createKillHabit(client, userId, {
      name: 'kill-loop-test-doomscrolling',
      triggerDescription: 'Stuck on a hard problem',
      urgeDescription: 'Escape the frustration',
      immediateReward: 'Dopamine hit',
      longTermCost: 'Lost 30+ minutes, momentum broken',
      replacementBehavior: 'Write down the sticking point',
      implementationIntention: 'IF I reach for my phone while stuck, THEN I write down the question first.',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data.escalation_level).toBe('l0_reminder'); // schema default
    expect(created.data.active).toBe(true);
    expect(created.data.implementation_intention).toContain('IF I reach for my phone');

    const listed = await listKillHabits(client, userId);
    expect(listed.ok).toBe(true);
    if (listed.ok) expect(listed.data.some((h) => h.id === created.data.id)).toBe(true);

    const deactivated = await deactivateKillHabit(client, userId, created.data.id);
    expect(deactivated.ok).toBe(true);
    if (deactivated.ok) expect(deactivated.data.active).toBe(false);

    // Deactivated habits are excluded from the active-only list (SCREEN_SPEC §1.6's
    // "today's active commitments") but the row itself still exists for history.
    const activeOnly = await listKillHabits(client, userId, true);
    expect(activeOnly.ok).toBe(true);
    if (activeOnly.ok) expect(activeOnly.data.some((h) => h.id === created.data.id)).toBe(false);
  });

  it('logs a relapse event in the five-second shape and gets a real local_date back from the DB trigger, not a placeholder', async () => {
    const habit = await createKillHabit(client, userId, { name: 'kill-loop-test-instagram' });
    expect(habit.ok).toBe(true);
    if (!habit.ok) return;

    const now = new Date();
    const logged = await logKillEvent(client, userId, {
      killHabitId: habit.data.id,
      outcome: 'relapsed',
      occurredAt: now,
      triggerContext: 'Difficult homework question',
      moodBefore: 3,
    });
    expect(logged.ok).toBe(true);
    if (!logged.ok) return;
    expect(logged.data.outcome).toBe('relapsed');
    expect(logged.data.trigger_context).toBe('Difficult homework question');
    expect(logged.data.mood_before).toBe(3);
    // The trigger, not this function, computed the real local_date -- proves the ''
    // placeholder never survives to the stored row.
    expect(logged.data.local_date).toBe(getUserLocalToday(TIMEZONE, now));

    const events = await listKillEvents(client, userId, habit.data.id);
    expect(events.ok).toBe(true);
    if (events.ok) expect(events.data.some((e) => e.id === logged.data.id)).toBe(true);
  });

  it('an untracked day is never silently treated as a success in bounce-back scoring', async () => {
    // A habit backdated 4 days so there's a real, controlled multi-day series to score:
    // day-4 (creation day, untracked) -> day-3 relapsed -> day-2 UNTRACKED (nothing
    // logged) -> day-1 resisted -> day-0/today untracked. If the untracked gap at day-2
    // were ever miscounted as a success, the lapse opened at day-3 would appear to
    // close there (a 1-day "recovery") instead of at day-1 (a real 2-day recovery).
    const day4Ago = addDays(today, -4);
    const day3Ago = addDays(today, -3);
    const day1Ago = addDays(today, -1);

    const habit = await createKillHabit(client, userId, { name: 'kill-loop-test-bounceback' });
    expect(habit.ok).toBe(true);
    if (!habit.ok) return;
    const { error: backdateError } = await client
      .from('kill_habits')
      .update({ created_at: `${day4Ago}T08:00:00Z` })
      .eq('id', habit.data.id);
    expect(backdateError).toBeNull();

    const relapse = await logKillEvent(client, userId, {
      killHabitId: habit.data.id,
      outcome: 'relapsed',
      occurredAt: new Date(`${day3Ago}T18:00:00Z`),
    });
    expect(relapse.ok).toBe(true);
    const resisted = await logKillEvent(client, userId, {
      killHabitId: habit.data.id,
      outcome: 'resisted',
      occurredAt: new Date(`${day1Ago}T18:00:00Z`),
    });
    expect(resisted.ok).toBe(true);
    // Deliberately nothing logged for day-2 or today -- those must read as 'untracked'.

    const result = await computeHabitBounceBack(client, userId, habit.data.id, today);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Exactly one closed episode: day-3 (failure) -> day-1 (success), a 2-day recovery.
    // If the untracked day-2 gap had been miscounted as a success, this would show as a
    // 1-day recovery (or a second, spurious episode) instead.
    expect(result.data.closedEpisodeCount).toBe(1);
    expect(result.data.ongoingLapseDays).toBe(0); // no lapse open as of today (last real event was a success)
  });
});
