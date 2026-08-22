import type { Course, DayView, InterventionRow, KillHabitRow, Task, TaskSessionRow } from "@collegeos/api";
import { signOut } from "@collegeos/api";
import { deriveDayBand } from "@collegeos/core";
import { color, space } from "@collegeos/design/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LogOut, Settings as SettingsIcon } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Aurora, Button, Panel, Skeleton, TabScreenScrollView } from "../../components/ui";
import { CheckinFlow } from "../../components/today/CheckinFlow";
import { DayTrace } from "../../components/today/DayTrace";
import { InterventionsSection } from "../../components/today/InterventionsSection";
import { DeadlineRadar } from "../../components/today/DeadlineRadar";
import { type FocusBlock, FocusLauncher } from "../../components/today/FocusLauncher";
import { TodayHeader } from "../../components/today/Header";
import { KillListSection } from "../../components/today/KillListSection";
import { type MitItem, MitList } from "../../components/today/MitList";
import { OnboardingGate } from "../../components/today/OnboardingGate";
import { QuickAddTaskModal } from "../../components/today/QuickAddTaskModal";
import { RecoveryBanner } from "../../components/today/RecoveryBanner";
import { WorkloadBand } from "../../components/today/WorkloadBand";
import { textStyle } from "../../design/typography";
import { getMobileSupabaseClient } from "../../lib/supabase/client";
import { useAuthSession } from "../../lib/useAuthSession";
import { type TodayMode, useTodayData } from "../../lib/useTodayData";

/** A focus session leaves no trace on the task it was for otherwise -- todayTaskSessions is
 *  already fetched onto dayView (see dayView.ts), so this costs no new query. Sums only ended
 *  sessions (actual_duration_min is null while a session is still active, server-computed once
 *  it ends). `null` means no session exists for this task today; a real session summing to 0
 *  (started and ended inside the same minute) is a different fact and must stay a real 0, not
 *  collapse into the same null "nothing happened" case -- R1. formatLoggedMinutesSuffix is what
 *  turns that 0 into honest copy rather than a bare, failure-reading "0 min". */
function sumLoggedMinutes(taskId: number, sessions: readonly TaskSessionRow[]): number | null {
  const relevant = sessions.filter((s) => s.task_id === taskId && s.actual_duration_min != null);
  if (relevant.length === 0) return null;
  return relevant.reduce((sum, s) => sum + (s.actual_duration_min ?? 0), 0);
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
      loggedMinutesToday: sumLoggedMinutes(mit.taskId, dayView.todayTaskSessions),
    };
  });
}

interface PlannedMitStatus {
  taskId: number;
  title: string;
  completed: boolean;
}

/** "Did I finish what I planned" is a different question from MitList's "what should I work
 *  on right now" (suggestedMits -- a live, algorithmic ranking of outstanding discretionary
 *  work, which correctly empties out as things get done). Answering the first question from
 *  the second one is exactly the R1 shape this codebase has been bitten by before: an empty
 *  suggestedMits means *both* "nothing was ever planned" and "everything planned is done,"
 *  and those must not render identically. tasks.mit_rank is the real record of what the user
 *  actually committed to at check-in (set by submitMorningCheckin, already selected in
 *  dayView.todayTasks -- no new query) and it stays on a task after it's completed, unlike
 *  suggestedMits. An empty result here means check-in was skipped or planned nothing; a
 *  non-empty result where every item is completed means the day's plan is actually done. */
function buildPlannedMitStatus(dayView: DayView): PlannedMitStatus[] {
  return dayView.todayTasks
    .filter((t): t is Task & { mit_rank: number } => t.mit_rank != null)
    .sort((a, b) => a.mit_rank - b.mit_rank)
    .map((t) => ({ taskId: t.id, title: t.title, completed: t.status === "completed" }));
}

/** §8's ratified headline rule: the top *outstanding* planned MIT's title, "All N done" once
 *  nothing is, or nothing at all when nothing was planned (the caller decides the fallback
 *  for that case). */
function computeHeadline(items: { title: string; completed: boolean }[]): { headline: string | null; progressLine: string | null } {
  if (items.length === 0) return { headline: null, progressLine: null };
  const doneCount = items.filter((i) => i.completed).length;
  const outstanding = items.find((i) => !i.completed);
  if (!outstanding) {
    return { headline: `All ${items.length} done`, progressLine: null };
  }
  return { headline: outstanding.title, progressLine: `${doneCount} of ${items.length} priorities done` };
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
    loggedMinutesToday: sumLoggedMinutes(task.id, dayView.todayTaskSessions),
  };
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
      loggedMinutesToday: sumLoggedMinutes(taskId, dayView.todayTaskSessions),
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
    loggedMinutesToday: sumLoggedMinutes(task.id, dayView.todayTaskSessions),
  };
}

export default function TodayScreen() {
  const router = useRouter();
  const { session } = useAuthSession();
  // Dev-only debug affordance, __DEV__-gated same as web's ?asOf= — never linked from any UI.
  const params = useLocalSearchParams<{ asOf?: string }>();
  const asOfIso = __DEV__ ? params.asOf : undefined;

  const result = useTodayData(asOfIso);
  const [signingOut, setSigningOut] = useState(false);
  const [dismissedCheckin, setDismissedCheckin] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut(getMobileSupabaseClient());
    setSigningOut(false);
    router.replace("/login");
  }

  // §6.1 -- /today's band is deriveDayBand over the live dayView's deliverable risks. Only
  // ready once real data exists; loading/error/onboarding get no band, same as a brand-new
  // account with zero deliverables -- null is honest in all of those, never a guess.
  const dayBand = result.status === "ready" ? deriveDayBand(result.data.dayView.risk.deliverableRisks) : null;

  return (
    <View style={styles.screen}>
      <Aurora band={dayBand} />
      <TabScreenScrollView
        transparent
        refreshControl={result.status === "ready" ? <RefreshControl refreshing={false} onRefresh={result.refetch} /> : undefined}
      >
        {/* §8 -- account identity/actions are not what Today is for; demoted to a slim,
            icon-first row instead of the wordmark + full-width buttons + raw email cluster
            that used to sit above the content the screen exists to show. */}
        <View style={styles.topBar}>
          <Text testID="today-user-email" style={textStyle("caption", color.inkFaint)}>
            {session?.user.email}
          </Text>
          <View style={styles.topBarActions}>
            <HeaderIconButton testID="settings-link" icon={SettingsIcon} label="Settings" onPress={() => router.push("/settings")} />
            <HeaderIconButton testID="sign-out" icon={LogOut} label="Sign out" loading={signingOut} onPress={handleSignOut} />
          </View>
        </View>

        {result.status === "loading" ? <TodayLoading /> : null}

        {result.status === "error" ? (
          <View style={styles.errorBox}>
            <Text style={textStyle("label", color.riskCritical)}>Couldn&apos;t load Today</Text>
            <Text style={textStyle("body", color.inkMuted)}>{result.error}</Text>
            <Button variant="secondary" onPress={result.refetch}>
              Try again
            </Button>
          </View>
        ) : null}

        {result.status === "ready" && session?.user.id ? (
          <TodayReady
            data={result.data}
            dismissedCheckin={dismissedCheckin}
            onCheckinDone={() => { setDismissedCheckin(true); result.refetch(); }}
            onCheckinSkip={() => setDismissedCheckin(true)}
            userId={session.user.id}
            onInterventionChanged={result.refetch}
          />
        ) : null}
      </TabScreenScrollView>
    </View>
  );
}

/** A small, quiet icon-only control for the demoted account-chrome row -- ghost-styled,
 *  44x44 minimum tap target regardless of the visual icon size, same convention as the
 *  island's inactive items. */
function HeaderIconButton({
  icon: Icon,
  label,
  onPress,
  loading = false,
  testID,
}: {
  icon: typeof SettingsIcon;
  label: string;
  onPress: () => void;
  loading?: boolean;
  testID?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={loading}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.headerIconButton,
        { opacity: pressed ? 0.6 : 1 },
        focused ? styles.headerIconButtonFocusRing : null,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={color.inkMuted} /> : <Icon size={18} color={color.inkMuted} strokeWidth={2} />}
    </Pressable>
  );
}

function TodayReady({
  data,
  dismissedCheckin,
  onCheckinDone,
  onCheckinSkip,
  userId,
  onInterventionChanged,
}: {
  data: {
    dayView: DayView;
    courses: Record<number, Course>;
    mode: TodayMode;
    killHabits: KillHabitRow[];
    activeFocusSession: TaskSessionRow | null;
    interventions: InterventionRow[];
  };
  dismissedCheckin: boolean;
  onCheckinDone: () => void;
  onCheckinSkip: () => void;
  userId: string;
  onInterventionChanged: () => void;
}) {
  const { dayView, courses, mode, killHabits, activeFocusSession, interventions } = data;
  const hasAnyData = dayView.todayTasks.length > 0 || dayView.todayCalendarEvents.length > 0 || dayView.upcomingDeliverables.length > 0;
  // MitList owns optimistic completion state for its own checkboxes (instant feedback, no
  // round-trip wait); this mirrors that same optimistic value up so the headline -- computed
  // from this exact array -- never lags a checkbox the user just ticked. Rolled back by
  // MitList's own onToggle(taskId, previous) call if the server request fails.
  const [completionOverrides, setCompletionOverrides] = useState<Record<number, boolean>>({});
  function handleMitToggle(taskId: number, completed: boolean) {
    setCompletionOverrides((prev) => ({ ...prev, [taskId]: completed }));
  }
  function withOverrides<T extends { taskId: number; completed: boolean }>(items: T[]): T[] {
    return items.map((item) =>
      item.taskId in completionOverrides ? { ...item, completed: completionOverrides[item.taskId] as boolean } : item,
    );
  }
  const mitItems = withOverrides(buildMitItems(dayView, courses));
  const focusBlock = buildFocusBlock(dayView, courses);
  const recoveryMitItems = withOverrides(buildRecoveryMitItems(dayView, courses));
  const recoveryFocusBlock = buildRecoveryFocusBlock(dayView, courses);
  // §8's ratified headline. "Did I finish my plan" is answered from tasks.mit_rank
  // (buildPlannedMitStatus), never from suggestedMits/mitItems -- see that function's
  // comment for why that's the wrong source. Recovery mode keeps its own recoveryMitItems
  // (the MVD kept set is a different, already-correct notion of "planned") and its existing
  // "Recovery day" fallback when nothing was kept -- not the date, since "today is scaled
  // down" outranks a timestamp on a day that's already been recomputed as one.
  const plannedMitStatus = withOverrides(buildPlannedMitStatus(dayView));
  const { headline: mitHeadline, progressLine } =
    mode === "recovery" ? computeHeadline(recoveryMitItems) : computeHeadline(plannedMitStatus);
  const headline = mitHeadline ?? (mode === "recovery" ? "Recovery day" : null);

  if (mode === "onboarding") {
    return (
      <View style={styles.sectionGap}>
        <TodayHeader
          today={dayView.today}
          health={dayView.todayHealth}
          sleepBaselineHours={dayView.profile.sleep_baseline_hours}
          headline={null}
          progressLine={null}
        />
        <OnboardingGate onCreated={onInterventionChanged} />
      </View>
    );
  }

  const normalBody = (
    <View style={styles.sectionGap}>
      {!hasAnyData ? (
        <Text style={textStyle("bodyS", color.inkFaint)}>
          Nothing set up yet — this is what Today will look like once a course or task exists.
        </Text>
      ) : null}
      <Section title="Top 3" action={<QuickAddTaskModal userId={userId} today={dayView.today} courses={courses} onAdded={onInterventionChanged} />}>
        <Panel>
          <MitList items={mitItems} onToggle={handleMitToggle} />
        </Panel>
      </Section>
      <Section title="Workload">
        <WorkloadBand workload={dayView.workload} />
      </Section>
      <Section title="Deadline radar">
        <Panel>
          <DeadlineRadar
            today={dayView.today}
            deliverables={dayView.upcomingDeliverables}
            deliverableRisks={dayView.risk.deliverableRisks}
            courses={courses}
          />
        </Panel>
      </Section>
      <KillListSection userId={dayView.profile.id} habits={killHabits} />
      <FocusLauncher userId={dayView.profile.id} block={focusBlock} activeSession={activeFocusSession} />
    </View>
  );

  return (
    <View style={styles.sectionGap}>
      <TodayHeader
        today={dayView.today}
        health={dayView.todayHealth}
        sleepBaselineHours={dayView.profile.sleep_baseline_hours}
        headline={headline}
        progressLine={progressLine}
      />

      <DayTrace
        today={dayView.today}
        timezone={dayView.profile.timezone}
        now={new Date()}
        calendarEvents={dayView.todayCalendarEvents}
        taskSessions={dayView.todayTaskSessions}
        tasks={dayView.todayTasks}
      />

      {/* U1 sits above the mode-specific body in every mode: an intervention fires because
          something has already gone off-plan, so it outranks whatever the day was otherwise
          going to show. Renders nothing when there is nothing pending. */}
      <InterventionsSection interventions={interventions} userId={userId} onChanged={onInterventionChanged} />

      {mode === "recovery" ? (
        <>
          <RecoveryBanner
            recoveryMode={dayView.recoveryMode}
            mvdPlan={dayView.mvdPlan}
            todayTasks={dayView.todayTasks}
            calendarEvents={dayView.todayCalendarEvents}
          />
          {recoveryMitItems.length > 0 ? (
            <Section title="Today's minimum">
              <MitList items={recoveryMitItems} onToggle={handleMitToggle} />
            </Section>
          ) : null}
          <FocusLauncher userId={dayView.profile.id} block={recoveryFocusBlock} activeSession={activeFocusSession} />
        </>
      ) : mode === "unplanned" && !dismissedCheckin ? (
        <CheckinFlow
          userId={dayView.profile.id}
          today={dayView.today}
          timezone={dayView.profile.timezone}
          todayTasks={dayView.todayTasks}
          courses={courses}
          suggestedMits={dayView.suggestedMits}
          todayHealth={dayView.todayHealth}
          workload={dayView.workload}
          recoveryMode={dayView.recoveryMode}
          onDone={onCheckinDone}
          onSkip={onCheckinSkip}
        />
      ) : (
        normalBody
      )}
    </View>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <Text style={textStyle("label", color.inkMuted)}>{title}</Text>
        {action ?? null}
      </View>
      {children}
    </View>
  );
}

function TodayLoading() {
  return (
    <View style={styles.sectionGap}>
      <View style={{ gap: space[2] }}>
        <Skeleton width={220} height={30} />
        <Skeleton width={160} height={16} />
      </View>
      <Skeleton height={72} radius="lg" />
      <View style={{ gap: space[3] }}>
        <Skeleton width={80} height={12} />
        <Skeleton height={44} radius="md" />
        <Skeleton height={44} radius="md" />
        <Skeleton height={44} radius="md" />
      </View>
      <View style={{ gap: space[3] }}>
        <Skeleton width={100} height={12} />
        <Skeleton height={12} radius="pill" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.ground,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  topBarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[1],
  },
  headerIconButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
  },
  headerIconButtonFocusRing: {
    outlineWidth: 2,
    outlineColor: color.accent,
    outlineOffset: 2,
    outlineStyle: "solid",
  },
  errorBox: {
    gap: space[3],
    alignItems: "flex-start",
  },
  sectionGap: {
    gap: space[6],
  },
  section: {
    gap: space[3],
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
