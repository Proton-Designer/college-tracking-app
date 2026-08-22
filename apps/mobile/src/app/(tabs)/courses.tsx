import { color, space } from "@collegeos/design/native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CapacityStrip } from "../../components/calendar/CapacityStrip";
import { ThisWeekView } from "../../components/calendar/ThisWeekView";
import { BackplanChain } from "../../components/courses/BackplanChain";
import { Button, RiskPill, Skeleton, TabScreenScrollView } from "../../components/ui";
import { textStyle } from "../../design/typography";
import { type CalendarObligation, useCalendarData } from "../../lib/useCalendarData";
import { type CoursesIndexRow, useCoursesIndexData } from "../../lib/useCoursesIndexData";
import { useThisWeekData } from "../../lib/useThisWeekData";
import { useAuthSession } from "../../lib/useAuthSession";
import { daysRemainingLabel } from "../../lib/dates";

function formatPct(pct: number | null): string {
  return pct == null ? "—" : `${Math.round(pct)}%`;
}

function typeLabel(type: string): string {
  return type.replace(/_/g, " ");
}

type View_ = "courses" | "week" | "horizon";

const VIEW_TITLE: Record<View_, string> = {
  courses: "Courses",
  week: "This week",
  horizon: "Horizon",
};

/**
 * SCREEN_SPEC §0 — Calendar is folded into Courses on mobile, not a fifth tab (five tabs
 * plus a settings entry point is past the right ceiling for a bottom bar). This is a flat
 * three-way peer switch, not a nested sub-toggle: "a list of my courses," "my week," and
 * "what's coming" are three equal answers to "what do I want to look at right now," not a
 * thing and a sub-thing -- ratified over an earlier nested-segments proposal specifically
 * to avoid the second row reading as a sub-mode nobody presses.
 */
export default function CoursesScreen() {
  const [view, setView] = useState<View_>("courses");
  const { session } = useAuthSession();
  const courses = useCoursesIndexData();
  const calendar = useCalendarData();
  const thisWeek = useThisWeekData();

  return (
    <TabScreenScrollView>
      <Text style={textStyle("displayM", color.ink)}>{VIEW_TITLE[view]}</Text>

      <View style={styles.segmentRow}>
        <SegmentTab label="Courses" active={view === "courses"} onPress={() => setView("courses")} />
        <SegmentTab label="This week" active={view === "week"} onPress={() => setView("week")} />
        <SegmentTab label="Horizon" active={view === "horizon"} onPress={() => setView("horizon")} />
      </View>

      {view === "courses" ? <CoursesView state={courses} /> : null}
      {view === "week" ? <ThisWeekSection userId={session?.user.id} state={thisWeek} /> : null}
      {view === "horizon" ? <CalendarView state={calendar} /> : null}
    </TabScreenScrollView>
  );
}

function ThisWeekSection({ userId, state }: { userId: string | undefined; state: ReturnType<typeof useThisWeekData> }) {
  if (state.status === "loading") {
    return (
      <View style={{ gap: space[4] }}>
        <Skeleton height={32} width={200} />
        <Skeleton height={80} radius="lg" />
        <Skeleton height={64} radius="lg" />
      </View>
    );
  }
  if (state.status === "error") {
    return (
      <View style={styles.errorBox}>
        <Text style={textStyle("label", color.riskCritical)}>Couldn&apos;t load this week&apos;s plan</Text>
        <Text style={textStyle("body", color.inkMuted)}>{state.error}</Text>
        <Button variant="secondary" onPress={state.refetch}>
          Try again
        </Button>
      </View>
    );
  }
  if (!userId) return null;

  return (
    <ThisWeekView
      userId={userId}
      today={state.data.today}
      timezone={state.data.timezone}
      plan={state.data.plan}
      onGenerated={state.refetch}
    />
  );
}

function SegmentTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={styles.segmentTab}
    >
      <Text style={textStyle("bodyS", active ? color.ink : color.inkMuted)}>{label}</Text>
      <View style={[styles.segmentRule, { backgroundColor: active ? color.accent : "transparent" }]} />
    </Pressable>
  );
}

function CoursesView({ state }: { state: ReturnType<typeof useCoursesIndexData> }) {
  if (state.status === "loading") {
    return (
      <View style={{ gap: space[4] }}>
        <Skeleton height={64} radius="lg" />
        <Skeleton height={64} radius="lg" />
        <Skeleton height={64} radius="lg" />
      </View>
    );
  }
  if (state.status === "error") {
    return (
      <View style={styles.errorBox}>
        <Text style={textStyle("label", color.riskCritical)}>Couldn&apos;t load courses</Text>
        <Text style={textStyle("body", color.inkMuted)}>{state.error}</Text>
        <Button variant="secondary" onPress={state.refetch}>
          Try again
        </Button>
      </View>
    );
  }

  const { rows, today } = state.data;
  if (rows.length === 0) {
    return <Text style={textStyle("bodyS", color.inkFaint)}>No courses yet. Add one, or upload a syllabus to get started.</Text>;
  }

  return (
    <View style={styles.list}>
      {rows.map((row, i) => (
        <CourseRow key={row.course.id} row={row} today={today} isLast={i === rows.length - 1} />
      ))}
    </View>
  );
}

function CourseRow({ row, today, isLast }: { row: CoursesIndexRow; today: string; isLast: boolean }) {
  const router = useRouter();
  const { course, gradeResult, courseRisk, nextDeadline } = row;

  return (
    <Pressable
      onPress={() => router.push(`/courses/${course.id}`)}
      style={({ pressed }) => [styles.row, isLast ? styles.rowLast : styles.rowBorder, { opacity: pressed ? 0.6 : 1 }]}
    >
      <View style={styles.rowTop}>
        <View style={styles.rowText}>
          <Text style={textStyle("bodyS", color.ink)}>{course.code}</Text>
          <Text style={textStyle("bodyS", color.inkFaint)}>{course.name}</Text>
        </View>
        {courseRisk ? (
          <View style={styles.riskRow}>
            <RiskPill band={courseRisk.result.band} label={courseRisk.result.band.toUpperCase()} />
            <Text style={textStyle("bodyS", color.inkFaint)}>{courseRisk.result.score}</Text>
          </View>
        ) : (
          <Text style={textStyle("bodyS", color.inkFaint)}>—</Text>
        )}
      </View>
      <Text style={textStyle("caption", color.inkMuted)}>
        {formatPct(gradeResult?.currentGrade ?? null)} of {formatPct(course.target_grade_pct)} target ·{" "}
        {nextDeadline ? `${nextDeadline.title} · ${daysRemainingLabel(today, nextDeadline.localDueDate)}` : "Nothing open"}
      </Text>
    </Pressable>
  );
}

function CalendarView({ state }: { state: ReturnType<typeof useCalendarData> }) {
  if (state.status === "loading") {
    return (
      <View style={{ gap: space[4] }}>
        <Skeleton height={80} radius="lg" />
        <Skeleton height={64} radius="lg" />
        <Skeleton height={64} radius="lg" />
      </View>
    );
  }
  if (state.status === "error") {
    return (
      <View style={styles.errorBox}>
        <Text style={textStyle("label", color.riskCritical)}>Couldn&apos;t load the calendar</Text>
        <Text style={textStyle("body", color.inkMuted)}>{state.error}</Text>
        <Button variant="secondary" onPress={state.refetch}>
          Try again
        </Button>
      </View>
    );
  }

  const { obligations, courses, today, capacity } = state.data;

  return (
    <View style={{ gap: space[6] }}>
      <View style={{ gap: space[2] }}>
        <Text style={textStyle("label", color.inkMuted)}>Available time, next two weeks</Text>
        <CapacityStrip days={capacity} />
      </View>

      {obligations.length === 0 ? (
        <Text style={textStyle("bodyS", color.inkFaint)}>Nothing open on the horizon.</Text>
      ) : (
        <View style={styles.list}>
          {obligations.map((o, i) => (
            <ObligationRow
              key={o.deliverable.id}
              obligation={o}
              courseCode={courses[o.deliverable.course_id]?.code ?? "—"}
              today={today}
              isLast={i === obligations.length - 1}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function ObligationRow({
  obligation,
  courseCode,
  today,
  isLast,
}: {
  obligation: CalendarObligation;
  courseCode: string;
  today: string;
  isLast: boolean;
}) {
  const { deliverable, risk, backplan } = obligation;

  return (
    <View style={[styles.row, isLast ? styles.rowLast : styles.rowBorder]}>
      <View style={styles.rowTop}>
        <View style={styles.rowText}>
          <Text style={textStyle("body", color.ink)}>{deliverable.title}</Text>
          <Text style={textStyle("caption", color.inkFaint)}>
            {courseCode} · {typeLabel(deliverable.type)} · {daysRemainingLabel(today, deliverable.local_due_date)}
          </Text>
        </View>
        {risk ? (
          <View style={styles.riskRow}>
            <RiskPill band={risk.result.band} label={risk.result.band.toUpperCase()} />
            <Text style={textStyle("bodyS", color.inkFaint)}>{risk.result.score}</Text>
          </View>
        ) : null}
      </View>
      <BackplanChain chain={backplan} />
    </View>
  );
}

const styles = StyleSheet.create({
  segmentRow: {
    flexDirection: "row",
    gap: space[6],
    marginTop: -space[3],
  },
  segmentTab: {
    gap: space[2],
    paddingBottom: space[2],
  },
  segmentRule: {
    height: 2,
    borderRadius: 1,
  },
  errorBox: {
    gap: space[3],
    alignItems: "flex-start",
  },
  list: {
    gap: 0,
  },
  row: {
    gap: space[1],
    paddingBottom: space[4],
    marginBottom: space[4],
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  rowLast: {
    paddingBottom: 0,
    marginBottom: 0,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[3],
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  riskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
  },
});
