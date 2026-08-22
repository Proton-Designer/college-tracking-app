import type { Course, DayView, InterventionRow, KillHabitRow, TaskSessionRow } from "@collegeos/api";
import { signOut } from "@collegeos/api";
import { color, space } from "@collegeos/design/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import { RefreshControl, StyleSheet, Text, View } from "react-native";
import { Button, Skeleton, TabScreenScrollView } from "../../components/ui";
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

  return (
    <TabScreenScrollView
      refreshControl={result.status === "ready" ? <RefreshControl refreshing={false} onRefresh={result.refetch} /> : undefined}
    >
      <View style={styles.topBar}>
        <Text style={textStyle("title", color.ink)}>CollegeOS</Text>
        <View style={styles.topBarRight}>
          <Text testID="today-user-email" style={textStyle("bodyS", color.inkMuted)}>
            {session?.user.email}
          </Text>
          <View style={styles.topBarActions}>
            <Button testID="settings-link" variant="secondary" onPress={() => router.push("/settings")}>
              Settings
            </Button>
            <Button testID="sign-out" variant="ghost" loading={signingOut} onPress={handleSignOut}>
              Sign out
            </Button>
          </View>
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
  const mitItems = buildMitItems(dayView, courses);
  const focusBlock = buildFocusBlock(dayView, courses);
  const recoveryMitItems = buildRecoveryMitItems(dayView, courses);
  const recoveryFocusBlock = buildRecoveryFocusBlock(dayView, courses);

  if (mode === "onboarding") {
    return (
      <View style={styles.sectionGap}>
        <TodayHeader today={dayView.today} health={dayView.todayHealth} sleepBaselineHours={dayView.profile.sleep_baseline_hours} />
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
        <MitList items={mitItems} />
      </Section>
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
      <KillListSection userId={dayView.profile.id} habits={killHabits} />
      <FocusLauncher userId={dayView.profile.id} block={focusBlock} activeSession={activeFocusSession} />
    </View>
  );

  return (
    <View style={styles.sectionGap}>
      <TodayHeader today={dayView.today} health={dayView.todayHealth} sleepBaselineHours={dayView.profile.sleep_baseline_hours} />

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
              <MitList items={recoveryMitItems} />
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
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  topBarRight: {
    alignItems: "flex-end",
    gap: space[2],
  },
  topBarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
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
