import type { Course, DayView } from "@collegeos/api";
import type { MitItem } from "@/components/today/MitList";
import { DayTrace } from "@/components/today/DayTrace";
import { DeadlineRadar } from "@/components/today/DeadlineRadar";
import { TodayHeader } from "@/components/today/Header";
import { MitList } from "@/components/today/MitList";
import { RecoveryBanner } from "@/components/today/RecoveryBanner";
import { UnplannedGate } from "@/components/today/UnplannedGate";
import { WorkloadBand } from "@/components/today/WorkloadBand";
import { loadTodayData } from "./data";
import { SignOutButton } from "./SignOutButton";

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

  const { dayView, courses, mode, userEmail, now } = result.data;
  const hasAnyData =
    dayView.todayTasks.length > 0 || dayView.todayCalendarEvents.length > 0 || dayView.upcomingDeliverables.length > 0;
  const mitItems = buildMitItems(dayView, courses);

  const normalBody = (
    <div className="flex flex-col gap-8">
      {!hasAnyData ? (
        <p className="text-body-s text-ink-faint">
          Nothing set up yet — this is what Today will look like once a course or task exists.
        </p>
      ) : null}
      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Top 3</h2>
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
    </div>
  );

  return (
    <main className="mx-auto flex w-full max-w-app flex-1 flex-col gap-8 px-8 py-10">
      <div className="flex items-center justify-between">
        <span className="font-serif text-title font-semibold text-ink">CollegeOS</span>
        <div className="flex items-center gap-3">
          <span data-testid="today-user-email" className="text-body-s text-ink-muted">
            {userEmail}
          </span>
          <SignOutButton />
        </div>
      </div>

      <TodayHeader today={dayView.today} health={dayView.todayHealth} sleepBaselineHours={dayView.profile.sleep_baseline_hours} />

      <DayTrace
        today={dayView.today}
        timezone={dayView.profile.timezone}
        now={now}
        calendarEvents={dayView.todayCalendarEvents}
        taskSessions={dayView.todayTaskSessions}
        tasks={dayView.todayTasks}
      />

      {mode === "recovery" ? (
        <RecoveryBanner recoveryMode={dayView.recoveryMode} mvdPlan={dayView.mvdPlan} todayTasks={dayView.todayTasks} />
      ) : mode === "unplanned" ? (
        <UnplannedGate
          today={dayView.today}
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
