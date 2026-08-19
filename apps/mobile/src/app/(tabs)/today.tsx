import type { Course, DayView } from "@collegeos/api";
import { signOut } from "@collegeos/api";
import { color, space } from "@collegeos/design/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Skeleton } from "../../components/ui";
import { CheckinFlow } from "../../components/today/CheckinFlow";
import { DayTrace } from "../../components/today/DayTrace";
import { DeadlineRadar } from "../../components/today/DeadlineRadar";
import { TodayHeader } from "../../components/today/Header";
import { type MitItem, MitList } from "../../components/today/MitList";
import { RecoveryBanner } from "../../components/today/RecoveryBanner";
import { WorkloadBand } from "../../components/today/WorkloadBand";
import { textStyle } from "../../design/typography";
import { getMobileSupabaseClient } from "../../lib/supabase/client";
import { useAuthSession } from "../../lib/useAuthSession";
import { useTodayData } from "../../lib/useTodayData";

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

export default function TodayScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space[6], paddingBottom: insets.bottom + space[8] }]}
      refreshControl={
        result.status === "ready" ? <RefreshControl refreshing={false} onRefresh={result.refetch} /> : undefined
      }
    >
      <View style={styles.topBar}>
        <Text style={textStyle("title", color.ink)}>CollegeOS</Text>
        <View style={styles.topBarRight}>
          <Text testID="today-user-email" style={textStyle("bodyS", color.inkMuted)}>
            {session?.user.email}
          </Text>
          <View style={styles.topBarActions}>
            <Button testID="settings-link" variant="ghost" onPress={() => router.push("/settings")}>
              Settings
            </Button>
            <Button testID="sign-out" variant="secondary" loading={signingOut} onPress={handleSignOut}>
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

      {result.status === "ready" ? (
        <TodayReady data={result.data} dismissedCheckin={dismissedCheckin} onCheckinDone={() => { setDismissedCheckin(true); result.refetch(); }} onCheckinSkip={() => setDismissedCheckin(true)} />
      ) : null}
    </ScrollView>
  );
}

function TodayReady({
  data,
  dismissedCheckin,
  onCheckinDone,
  onCheckinSkip,
}: {
  data: { dayView: DayView; courses: Record<number, Course>; mode: "unplanned" | "recovery" | "normal" };
  dismissedCheckin: boolean;
  onCheckinDone: () => void;
  onCheckinSkip: () => void;
}) {
  const { dayView, courses, mode } = data;
  const hasAnyData = dayView.todayTasks.length > 0 || dayView.todayCalendarEvents.length > 0 || dayView.upcomingDeliverables.length > 0;
  const mitItems = buildMitItems(dayView, courses);

  const normalBody = (
    <View style={styles.sectionGap}>
      {!hasAnyData ? (
        <Text style={textStyle("bodyS", color.inkFaint)}>
          Nothing set up yet — this is what Today will look like once a course or task exists.
        </Text>
      ) : null}
      <Section title="Top 3">
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

      {mode === "recovery" ? (
        <RecoveryBanner recoveryMode={dayView.recoveryMode} mvdPlan={dayView.mvdPlan} todayTasks={dayView.todayTasks} />
      ) : mode === "unplanned" && !dismissedCheckin ? (
        <CheckinFlow
          userId={dayView.profile.id}
          today={dayView.today}
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={textStyle("label", color.inkMuted)}>{title}</Text>
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
  flex: {
    flex: 1,
    backgroundColor: color.ground,
  },
  content: {
    paddingHorizontal: space[5],
    gap: space[6],
  },
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
});
