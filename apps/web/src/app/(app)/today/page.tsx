import type { Course, DayView } from "@collegeos/api";
import { deriveDayBand } from "@collegeos/core";
import type { ReactNode } from "react";
import type { FocusBlock } from "@/components/today/FocusLauncher";
import type { MitItem } from "@/components/today/MitList";
import { Aurora } from "@/components/ui/Aurora";
import { Panel } from "@/components/ui/Panel";
import { DayTrace } from "@/components/today/DayTrace";
import { DeadlineRadar } from "@/components/today/DeadlineRadar";
import { FocusLauncher } from "@/components/today/FocusLauncher";
import { TodayHeader } from "@/components/today/Header";
import { KillListSection } from "@/components/today/KillListSection";
import { ConnectedMitList, MitFocusProvider, TodayFocusHeadline } from "@/components/today/MitFocus";
import { OnboardingGate } from "@/components/today/OnboardingGate";
import { QuickAddTaskModal } from "@/components/today/QuickAddTaskModal";
import { VoiceCaptureModal } from "@/components/today/VoiceCaptureModal";
import { InterventionsSection } from "@/components/today/InterventionsSection";
import { RecoveryBanner } from "@/components/today/RecoveryBanner";
import { UnplannedGate } from "@/components/today/UnplannedGate";
import { WorkloadBand } from "@/components/today/WorkloadBand";
import { loadTodayData } from "./data";

/** Panel earned by a rule, not a hunch: Top 3 and Deadline radar are lists of rows, the same
 *  shape as InterventionsSection and KillListSection, which already sit in real Panels a few
 *  lines away on this exact page -- bare-next-to-panelled was the one wrong answer. The heading
 *  itself is page structure, so it stays on the ground above the panel, not inside it; the
 *  hairline top border is gone since a panel boundary is the section's own separation now. */
function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">{title}</h2>
        {action}
      </div>
      <Panel>{children}</Panel>
    </section>
  );
}

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
  // §6 — an instrument reading, not decoration. `deriveDayBand` returns null for an account
  // with no deliverable risk yet, and that's the honest case: no history, no atmosphere.
  const dayBand = deriveDayBand(dayView.risk.deliverableRisks);

  const normalBody = (
    <div className="flex flex-col gap-8">
      {!hasAnyData ? (
        <p className="text-body-s text-ink-muted">
          Nothing set up yet — this is what Today will look like once a course or task exists.
        </p>
      ) : null}
      {/* Top 3 + Focus are the primary "what do I do" thread; Workload + Deadline radar are
          secondary readouts that inform it. Independent of each other, neither needs full
          width, so they pair side by side at >=1280px (docs/L13_DESIGN_PASS.md #1) instead
          of stacking under a page that otherwise runs out of content halfway down. */}
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
        <div className="flex flex-col gap-8">
          <Section
            title="Top 3"
            action={
              <div className="flex items-center gap-2">
                <VoiceCaptureModal today={dayView.today} />
                <QuickAddTaskModal today={dayView.today} courses={courses} />
              </div>
            }
          >
            <ConnectedMitList taskSessions={dayView.todayTaskSessions} />
          </Section>
          <FocusLauncher block={focusBlock} activeSession={activeFocusSession} taskSessions={dayView.todayTaskSessions} />
        </div>
        <div className="flex flex-col gap-8">
          <Section title="Workload">
            <WorkloadBand workload={dayView.workload} />
          </Section>
          <Section title="Deadline radar">
            <DeadlineRadar
              today={dayView.today}
              deliverables={dayView.upcomingDeliverables}
              deliverableRisks={dayView.risk.deliverableRisks}
              courses={courses}
            />
          </Section>
        </div>
      </div>
      <KillListSection habits={killHabits} />
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
    <MitFocusProvider initialItems={mode === "recovery" ? recoveryMitItems : mitItems}>
    <main className="mx-auto flex w-full max-w-app flex-1 flex-col gap-8 px-8 py-10">
      <Aurora band={dayBand} />

      {/* §8 — the one thing this screen exists to tell the user, at displayL+, in the header
          where a lead statement actually leads (not two-thirds down the page inside a card --
          RecoveryBanner's own "Recovery mode active" label is detail now, not the lead).
          Recovery mode names the kept task the same way normal mode names the top MIT --
          ratified cross-platform after an audit found web special-cased Recovery to a fixed
          "Recovery day" string with no stated reason, which silently drifted from mobile's
          actual behavior (name the kept task, "Recovery day" only when nothing was kept).
          TodayHeader (the date) renders AFTER this, not before -- two stacked eyebrows above
          the headline was the bug: the headline gets the top slot, the date supports it
          underneath, same order as mobile. */}
      {mode === "normal" ? (
        <TodayFocusHeadline />
      ) : mode === "recovery" ? (
        <TodayFocusHeadline fallbackHeadline="Recovery day" />
      ) : null}

      <TodayHeader today={dayView.today} health={dayView.todayHealth} sleepBaselineHours={dayView.profile.sleep_baseline_hours} />

      {/* A full max-w-app ribbon for a genuinely empty day (nothing scheduled at all) is a very
          wide box with two empty lanes -- doesn't earn that much of the fold. Constrains to the
          same width Recovery's narrower body already uses when there's nothing to draw. Mirrors
          DayTrace's own hasAnyData exactly (calendar events + task sessions, not upcoming
          deliverables -- hasAnyData above answers a broader question than "is the ribbon empty"). */}
      <div className={dayView.todayCalendarEvents.length > 0 || dayView.todayTaskSessions.length > 0 ? undefined : "max-w-[640px]"}>
        <DayTrace
          today={dayView.today}
          timezone={dayView.profile.timezone}
          now={now}
          calendarEvents={dayView.todayCalendarEvents}
          taskSessions={dayView.todayTaskSessions}
          tasks={dayView.todayTasks}
        />
      </div>

      {/* U1 sits above the mode-specific body in every mode. An intervention fires because
          something has already gone off-plan, so it outranks whatever the day was otherwise
          going to show -- and burying it inside one mode's branch would mean the deviation
          prompt never appears on precisely the days it matters most. Renders nothing when
          there is nothing pending. */}
      <InterventionsSection interventions={interventions} />

      {mode === "recovery" ? (
        // Recovery Mode narrows the day on purpose -- its content column narrows to match
        // (docs/L13_DESIGN_PASS.md #1's "constrain the content column" option) rather than
        // stretch a deliberately sparse day across the same full-width canvas as a normal
        // one, where the empty space below it read as a page that failed to load.
        <div className="flex max-w-[640px] flex-col gap-8">
          <RecoveryBanner
            recoveryMode={dayView.recoveryMode}
            mvdPlan={dayView.mvdPlan}
            todayTasks={dayView.todayTasks}
            calendarEvents={dayView.todayCalendarEvents}
          />
          {recoveryMitItems.length > 0 ? (
            <Section title="Today's minimum">
              <ConnectedMitList taskSessions={dayView.todayTaskSessions} />
            </Section>
          ) : null}
          <FocusLauncher block={recoveryFocusBlock} activeSession={activeFocusSession} taskSessions={dayView.todayTaskSessions} />
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
    </MitFocusProvider>
  );
}
