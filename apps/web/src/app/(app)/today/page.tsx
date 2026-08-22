import type { Course, DayView } from "@collegeos/api";
import type { FocusBlock } from "@/components/today/FocusLauncher";
import type { MitItem } from "@/components/today/MitList";
import { DayTrace } from "@/components/today/DayTrace";
import { DeadlineRadar } from "@/components/today/DeadlineRadar";
import { FocusLauncher } from "@/components/today/FocusLauncher";
import { TodayHeader } from "@/components/today/Header";
import { KillListSection } from "@/components/today/KillListSection";
import { MitList } from "@/components/today/MitList";
import { OnboardingGate } from "@/components/today/OnboardingGate";
import { QuickAddTaskModal } from "@/components/today/QuickAddTaskModal";
import { InterventionsSection } from "@/components/today/InterventionsSection";
import { RecoveryBanner } from "@/components/today/RecoveryBanner";
import { UnplannedGate } from "@/components/today/UnplannedGate";
import { WorkloadBand } from "@/components/today/WorkloadBand";
import { loadTodayData } from "./data";

function buildFocusBlock(dayView: DayView, courses: Record<number, Course>): FocusBlock | null {
  const top = dayView.suggestedMits[0];
  if (!top) return null;
  const task = dayView.todayTasks.find((t) => t.id === top.taskId);
  if (!task) return null;
  return {
    taskId: task.id,
    title: task.title,
    courseCode: task.course_id != null ? (courses[task.course_id]?.code ?? null) : null,
    calibratedMinutes: top.calibratedMinutes,
    location: task.planned_location,
  };
}

function buildMitItems(dayView: DayView, courses: Record<number, Course>): MitItem[] {
  const tasksById = new Map(dayView.todayTasks.map((t) => [t.id, t]));
  return dayView.suggestedMits.map((mit) => {
    const task = tasksById.get(mit.taskId);
    return {
      taskId: mit.taskId,
      rank: mit.rank,
      title: task?.title ?? "Untitled task",
      courseCode: task?.course_id != null ? (courses[task.course_id]?.code ?? null) : null,
      completed: task?.status === "completed",
      calibratedMinutes: mit.calibratedMinutes,
      calibrationConfidence: mit.calibrationConfidence,
    };
  });
}

/** Recovery Mode's "kept" set is hard-deadline + at most one study-block task -- both real
 *  tasks, both completable. (Attendance/kept calendar events aren't tasks and were never
 *  completable in the normal flow either.) When a kept task isn't among suggestedMits (it
 *  wasn't ranked as a top MIT), fall back to its raw estimate with 'insufficient' confidence
 *  -- the same fallback buildTodayWorkloadItems already uses for a null estimate, not a
 *  number invented here. */
function buildRecoveryMitItems(dayView: DayView, courses: Record<number, Course>): MitItem[] {
  const kept = dayView.mvdPlan?.kept ?? [];
  const tasksById = new Map(dayView.todayTasks.map((t) => [t.id, t]));
  const suggestedById = new Map(dayView.suggestedMits.map((m) => [m.taskId, m]));

  const items: MitItem[] = [];
  for (const item of kept) {
    if (item.kind !== "hardDeadline" && item.kind !== "studyBlock") continue;
    const taskId = Number(item.id);
    const task = tasksById.get(taskId);
    if (!task) continue;
    const suggested = suggestedById.get(taskId);
    items.push({
      taskId,
      rank: suggested?.rank ?? items.length + 1,
      title: task.title,
      courseCode: task.course_id != null ? (courses[task.course_id]?.code ?? null) : null,
      completed: task.status === "completed",
      calibratedMinutes: suggested?.calibratedMinutes ?? task.estimated_minutes ?? 30,
      calibrationConfidence: suggested?.calibrationConfidence ?? "insufficient",
    });
  }
  return items;
}

function buildRecoveryFocusBlock(dayView: DayView, courses: Record<number, Course>): FocusBlock | null {
  const keptStudyBlock = dayView.mvdPlan?.kept.find((i) => i.kind === "studyBlock");
  if (!keptStudyBlock) return null;
  const taskId = Number(keptStudyBlock.id);
  const task = dayView.todayTasks.find((t) => t.id === taskId);
  if (!task) return null;
  const suggested = dayView.suggestedMits.find((m) => m.taskId === taskId);
  return {
    taskId: task.id,
    title: task.title,
    courseCode: task.course_id != null ? (courses[task.course_id]?.code ?? null) : null,
    calibratedMinutes: suggested?.calibratedMinutes ?? task.estimated_minutes ?? 30,
    location: task.planned_location,
  };
}

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string }>;
}) {
  // Dev-only debug affordance: overriding "now" so a specific historical day (e.g. a real
  // Recovery Mode trigger) can be inspected without a synthetic user. Never exposed as a
  // product feature — no UI links to this param, and it's compiled out of production builds
  // entirely so it can't affect prod behavior even if someone guesses the query string.
  const { asOf } = process.env.NODE_ENV !== "production" ? await searchParams : { asOf: undefined };
  const asOfDate = asOf && !Number.isNaN(Date.parse(asOf)) ? new Date(asOf) : undefined;
  const result = await loadTodayData(asOfDate ? { asOf: asOfDate } : undefined);

  if (!result.ok) {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col items-start gap-3 px-8 py-12">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">Couldn&apos;t load Today</p>
        <p className="text-body text-ink-muted">{result.error}</p>
        <a href="/today" className="font-mono text-body-s text-accent underline underline-offset-2">
          Try again
        </a>
      </main>
    );
  }

  const { dayView, courses, mode, killHabits, activeFocusSession, interventions, now } = result.data;
  const hasAnyData =
    dayView.todayTasks.length > 0 || dayView.todayCalendarEvents.length > 0 || dayView.upcomingDeliverables.length > 0;
  const mitItems = buildMitItems(dayView, courses);
  const focusBlock = buildFocusBlock(dayView, courses);
  const recoveryMitItems = buildRecoveryMitItems(dayView, courses);
  const recoveryFocusBlock = buildRecoveryFocusBlock(dayView, courses);

  const normalBody = (
    <div className="flex flex-col gap-8">
      {!hasAnyData ? (
        <p className="text-body-s text-ink-faint">
          Nothing set up yet — this is what Today will look like once a course or task exists.
        </p>
      ) : null}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Top 3</h2>
          <QuickAddTaskModal today={dayView.today} courses={courses} />
        </div>
        <MitList items={mitItems} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Workload</h2>
        <WorkloadBand workload={dayView.workload} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Deadline radar</h2>
        <DeadlineRadar
          today={dayView.today}
          deliverables={dayView.upcomingDeliverables}
          deliverableRisks={dayView.risk.deliverableRisks}
          courses={courses}
        />
      </section>
      <KillListSection habits={killHabits} />
      <FocusLauncher block={focusBlock} activeSession={activeFocusSession} />
    </div>
  );

  if (mode === "onboarding") {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col gap-8 px-8 py-10">
        <TodayHeader today={dayView.today} health={dayView.todayHealth} sleepBaselineHours={dayView.profile.sleep_baseline_hours} />
        <OnboardingGate />
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-app flex-1 flex-col gap-8 px-8 py-10">
      <TodayHeader today={dayView.today} health={dayView.todayHealth} sleepBaselineHours={dayView.profile.sleep_baseline_hours} />

      <DayTrace
        today={dayView.today}
        timezone={dayView.profile.timezone}
        now={now}
        calendarEvents={dayView.todayCalendarEvents}
        taskSessions={dayView.todayTaskSessions}
        tasks={dayView.todayTasks}
      />

      {/* U1 sits above the mode-specific body in every mode. An intervention fires because
          something has already gone off-plan, so it outranks whatever the day was otherwise
          going to show -- and burying it inside one mode's branch would mean the deviation
          prompt never appears on precisely the days it matters most. Renders nothing when
          there is nothing pending. */}
      <InterventionsSection interventions={interventions} />

      {mode === "recovery" ? (
        <div className="flex flex-col gap-8">
          <RecoveryBanner
            recoveryMode={dayView.recoveryMode}
            mvdPlan={dayView.mvdPlan}
            todayTasks={dayView.todayTasks}
            calendarEvents={dayView.todayCalendarEvents}
          />
          {recoveryMitItems.length > 0 ? (
            <section className="flex flex-col gap-3">
              <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Today&apos;s minimum</h2>
              <MitList items={recoveryMitItems} />
            </section>
          ) : null}
          <FocusLauncher block={recoveryFocusBlock} activeSession={activeFocusSession} />
        </div>
      ) : mode === "unplanned" ? (
        <UnplannedGate
          today={dayView.today}
          timezone={dayView.profile.timezone}
          todayTasks={dayView.todayTasks}
          courses={courses}
          suggestedMits={dayView.suggestedMits}
          todayHealth={dayView.todayHealth}
          workload={dayView.workload}
          recoveryMode={dayView.recoveryMode}
        >
          {normalBody}
        </UnplannedGate>
      ) : (
        normalBody
      )}
    </main>
  );
}
