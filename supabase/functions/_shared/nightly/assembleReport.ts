// The deterministic nightly report -- built as a first-class, complete artifact on its
// own (Lead's explicit reframing for L7): with no ANTHROPIC_API_KEY tonight, this is not
// a fallback path, it is THE path that actually runs. The numbers, traces, bands,
// quadrant diagnosis, friction distribution, and bounce-back trend assembled here must
// be genuinely useful to read with zero model involvement. The (future, key-gated) LLM
// layer adds interpretation ON TOP of this, never instead of it.

// deno-lint-ignore no-explicit-any
type AnySupabaseClient = any;

import { addDays, generateNightlyHeadline, type DeterministicNightlyReport, type KillHabitBounceBack, type LocalDate } from "../core/index.ts";
import {
  computeHabitBounceBack,
  computeRiskAssessment,
  computeTodayRecoveryMode,
  computeUserFrictionDistribution,
  computeUserFrictionTrend,
  loadCourseGradeProjections,
  computePlanningExecutionForDate,
} from "./domainQueries.ts";

export type { DeterministicNightlyReport, KillHabitBounceBack } from "../core/index.ts";

export async function assembleDeterministicNightlyReport(
  client: AnySupabaseClient,
  userId: string,
  localDate: LocalDate,
): Promise<DeterministicNightlyReport> {
  const dataGaps: string[] = [];

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("sleep_baseline_hours, timezone")
    .eq("id", userId)
    .single();
  if (profileError) throw profileError;

  const { data: courses, error: coursesError } = await client
    .from("courses")
    .select("id, code, name, difficulty_rating, confidence_rating, target_grade_pct")
    .eq("user_id", userId)
    .is("archived_at", null);
  if (coursesError) throw coursesError;

  const [
    { data: checkinRow, error: checkinError },
    { data: reviewRow, error: reviewError },
    gradeProjections,
  ] = await Promise.all([
    client.from("daily_checkins").select("*").eq("user_id", userId).eq("local_date", localDate).maybeSingle(),
    client.from("daily_reviews").select("*").eq("user_id", userId).eq("local_date", localDate).maybeSingle(),
    loadCourseGradeProjections(client, userId),
  ]);
  if (checkinError) throw checkinError;
  if (reviewError) throw reviewError;

  if (!checkinRow) dataGaps.push("No morning check-in recorded for this day.");
  if (!reviewRow) dataGaps.push("No night review recorded for this day -- MITs/deep-work totals are unavailable.");

  const [recoveryMode, planningExecution, riskAssessment] = await Promise.all([
    computeTodayRecoveryMode(client, userId, localDate, profile.sleep_baseline_hours, profile.timezone),
    computePlanningExecutionForDate(client, userId, localDate),
    computeRiskAssessment(client, userId, localDate, courses ?? [], gradeProjections, profile.sleep_baseline_hours, profile.timezone),
  ]);
  if (!planningExecution) dataGaps.push("Planning-vs-execution diagnosis unavailable (no review to compare against).");

  const previousWeek = { since: addDays(localDate, -13), until: addDays(localDate, -7) };
  const currentWeek = { since: addDays(localDate, -6), until: localDate };
  const [frictionToday, frictionTrend] = await Promise.all([
    computeUserFrictionDistribution(client, userId, localDate, localDate),
    computeUserFrictionTrend(client, userId, previousWeek, currentWeek),
  ]);

  const { data: activeHabits, error: habitsError } = await client
    .from("kill_habits")
    .select("id, name")
    .eq("user_id", userId)
    .eq("active", true);
  if (habitsError) throw habitsError;

  const killLoop: KillHabitBounceBack[] = await Promise.all(
    // deno-lint-ignore no-explicit-any
    (activeHabits ?? []).map(async (habit: any) => {
      const [bounceBack, { data: eventsToday, error: eventsError }] = await Promise.all([
        computeHabitBounceBack(client, userId, habit.id, localDate),
        client.from("kill_events").select("outcome").eq("user_id", userId).eq("kill_habit_id", habit.id).eq("local_date", localDate),
      ]);
      if (eventsError) throw eventsError;
      return {
        killHabitId: habit.id,
        name: habit.name,
        bounceBack,
        eventsToday: eventsToday?.length ?? 0,
        // deno-lint-ignore no-explicit-any
        relapsesToday: (eventsToday ?? []).filter((e: any) => e.outcome === "relapsed").length,
      };
    }),
  );
  if ((activeHabits ?? []).length === 0) dataGaps.push("No active kill-list habits to score bounce-back against.");

  const { data: sessionsToday, error: sessionsError } = await client
    .from("task_sessions")
    .select("status, actual_duration_min, interruptions, tasks!inner(planned_date, user_id)")
    .eq("tasks.user_id", userId)
    .eq("tasks.planned_date", localDate);
  if (sessionsError) throw sessionsError;

  const sessions = sessionsToday ?? [];
  const focusSessions = {
    count: sessions.length,
    // deno-lint-ignore no-explicit-any
    completedCount: sessions.filter((s: any) => s.status === "completed").length,
    // deno-lint-ignore no-explicit-any
    abandonedCount: sessions.filter((s: any) => s.status === "abandoned").length,
    // deno-lint-ignore no-explicit-any
    totalActualMin: sessions.reduce((sum: number, s: any) => sum + (s.actual_duration_min ?? 0), 0),
    // deno-lint-ignore no-explicit-any
    totalInterruptions: sessions.reduce((sum: number, s: any) => sum + (s.interruptions ?? 0), 0),
  };
  if (sessions.length === 0) dataGaps.push("No focus sessions logged for this day.");

  const review = reviewRow
    ? {
        mitsPlanned: reviewRow.mits_planned,
        mitsCompleted: reviewRow.mits_completed,
        deepWorkPlannedMin: reviewRow.deep_work_planned_min,
        deepWorkActualMin: reviewRow.deep_work_actual_min,
        screenTimeMin: reviewRow.screen_time_min,
        distractingTimeMin: reviewRow.distracting_time_min,
        workoutCompleted: reviewRow.workout_completed,
        killListSuccessCount: reviewRow.kill_list_success_count,
        killListTotal: reviewRow.kill_list_total,
        proudText: reviewRow.proud_text,
        wentWrongText: reviewRow.went_wrong_text,
        importantNoteText: reviewRow.important_note_text,
      }
    : null;

  const { headline, objectiveSummary } = generateNightlyHeadline({
    review,
    recoveryMode,
    planningExecution,
    courseRisks: riskAssessment.courseRisks,
  });

  return {
    localDate,
    dataGaps,
    headline,
    objectiveSummary,
    checkin: checkinRow
      ? {
          energy: checkinRow.energy,
          mood: checkinRow.mood,
          derailmentReason: checkinRow.derailment_reason,
          capacityMinutes: checkinRow.capacity_minutes,
          floorMinutes: checkinRow.floor_minutes,
          targetMinutes: checkinRow.target_minutes,
          recoveryModeTriggeredAtCheckin: checkinRow.recovery_mode_triggered,
        }
      : null,
    review,
    recoveryMode,
    planningExecution,
    gradeProjections,
    riskAssessment,
    frictionToday,
    frictionTrend,
    killLoop,
    focusSessions,
  };
}
