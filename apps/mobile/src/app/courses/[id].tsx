import { color, space } from "@collegeos/design/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AddAssignmentModal } from "../../components/courses/AddAssignmentModal";
import { AssignmentsTable } from "../../components/courses/AssignmentsTable";
import { CourseRiskPanel } from "../../components/courses/CourseRiskPanel";
import { EditCourseModal } from "../../components/courses/EditCourseModal";
import { GradeBoundariesSection } from "../../components/courses/GradeBoundariesSection";
import { GradeCategoriesSection } from "../../components/courses/GradeCategoriesSection";
import { ScenarioPlanner } from "../../components/courses/ScenarioPlanner";
import { Aurora, Button, Metric, NavLink, Panel, RiskPill, Skeleton, WarningCard } from "../../components/ui";
import { textStyle } from "../../design/typography";
import { useAuthSession } from "../../lib/useAuthSession";
import { type CourseDetailData, useCourseDetailData } from "../../lib/useCourseDetailData";

function formatPct(pct: number | null): string {
  return pct == null ? "—" : `${Math.round(pct)}`;
}

/** Ported from web's course detail page (the Semester Map). Reached only by pushing from
 *  the Courses tab (or a course row) -- no native back header here, an explicit "Courses"
 *  link at the top instead, same affordance web uses, rather than depending on the
 *  (tabs) group's single shared back-button title being contextually accurate this deep. */
export default function CourseDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const courseId = Number(id);
  const result = useCourseDetailData(courseId);
  // §6.1 -- /courses/[id]'s band is this one course's own CourseRiskSummary.result.band,
  // not deriveDayBand (that's the list view's -- a different question, a different source).
  const dayBand = result.status === "ready" ? (result.data.courseRisk?.result.band ?? null) : null;

  return (
    <View style={styles.screen}>
      <Aurora band={dayBand} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space[6], paddingBottom: insets.bottom + space[8] }]}
      >
      <NavLink label="Courses" direction="back" onPress={() => router.back()} />

      {!Number.isInteger(courseId) ? <Text style={textStyle("body", color.inkMuted)}>Not a valid course.</Text> : null}

      {Number.isInteger(courseId) && result.status === "loading" ? (
        <View style={{ gap: space[4] }}>
          <Skeleton height={48} width={160} />
          <Skeleton height={80} radius="lg" />
          <Skeleton height={160} radius="lg" />
        </View>
      ) : null}

      {Number.isInteger(courseId) && result.status === "error" ? (
        <View style={styles.errorBox}>
          <Text style={textStyle("label", color.riskCritical)}>Couldn&apos;t load this course</Text>
          <Text style={textStyle("body", color.inkMuted)}>{result.error}</Text>
          <Button variant="secondary" onPress={result.refetch}>
            Try again
          </Button>
        </View>
      ) : null}

      {Number.isInteger(courseId) && result.status === "ready" && session?.user.id ? (
        <CourseDetailReady userId={session.user.id} courseId={courseId} data={result.data} onChanged={result.refetch} />
      ) : null}
      </ScrollView>
    </View>
  );
}

function CourseDetailReady({
  userId,
  courseId,
  data,
  onChanged,
}: {
  userId: string;
  courseId: number;
  data: CourseDetailData;
  onChanged: () => void;
}) {
  const router = useRouter();
  const { course, gradeResult, courseRisk, deliverableRisks, today, categories, gradeItems, gradeBoundaries, deliverables, backplanChains, officeHours } = data;
  const weightSumIssue = gradeResult?.issues.find((i) => i.kind === "weightSumWarning");
  const categoryNameById = new Map(categories.map((c) => [String(c.id), c.name]));

  return (
    <View style={styles.stack}>
      <View style={{ gap: space[3] }}>
        <View style={styles.headerRow}>
          <View>
            <Text style={textStyle("displayM", color.ink)}>{course.code}</Text>
            <Text style={textStyle("body", color.inkMuted)}>
              {course.name} · {course.term}
            </Text>
          </View>
          {courseRisk ? (
            <View style={styles.riskRow}>
              <RiskPill band={courseRisk.result.band} label={courseRisk.result.band.toUpperCase()} />
              <Text style={textStyle("bodyS", color.inkMuted)}>{courseRisk.result.score}</Text>
            </View>
          ) : null}
        </View>
        <View style={{ alignSelf: "flex-start" }}>
          <EditCourseModal userId={userId} course={course} onSaved={onChanged} />
        </View>
      </View>

      <View style={styles.metricRow}>
        <Metric label="Current" value={formatPct(gradeResult?.currentGrade ?? null)} unit="%" />
        <Metric label="Projected" value={formatPct(gradeResult?.projectedGrade ?? null)} unit="%" />
        <Metric label="Target" value={formatPct(course.target_grade_pct)} unit="%" />
        {courseRisk ? (
          <Metric
            label="Risk confidence"
            value={courseRisk.result.confidence}
            delta={{ label: `${courseRisk.result.sampleSize} open item${courseRisk.result.sampleSize === 1 ? "" : "s"}`, direction: "flat" }}
          />
        ) : null}
      </View>

      {weightSumIssue ? (
        <WarningCard>
          <Text style={textStyle("bodyS", color.riskHigh)}>
            {weightSumIssue.message} — category weights are never silently normalized, so this course&apos;s grade math is provisional until
            the weights add up to 100.
          </Text>
        </WarningCard>
      ) : null}

      {gradeResult ? (
        <ScenarioPlanner
          userId={userId}
          courseId={courseId}
          categoryResults={gradeResult.categoryResults}
          categoryNameById={categoryNameById}
          defaultTargetPct={course.target_grade_pct}
        />
      ) : null}

      {/* 5.2: professor noise in, updated plan out. The paste flow stages a diff; only
          announcement-confirm applies one. */}
      <Button variant="secondary" onPress={() => router.push(`/announcement?courseId=${course.id}`)}>
        Paste an announcement
      </Button>
      <Button variant="secondary" onPress={() => router.push(`/bank?courseId=${course.id}`)}>
        Question Bank
      </Button>

      <Section title="Why this score">
        <CourseRiskPanel deliverableRisks={deliverableRisks} today={today} />
      </Section>

      <View style={{ gap: space[3] }}>
        <View style={styles.headerRow}>
          <Text style={textStyle("label", color.inkMuted)}>Assignments & exams</Text>
          <AddAssignmentModal userId={userId} courseId={courseId} onAdded={onChanged} />
        </View>
        <AssignmentsTable deliverables={deliverables} gradeItems={gradeItems} categories={categories} backplanChains={backplanChains} today={today} />
      </View>

      <GradeCategoriesSection userId={userId} courseId={courseId} categories={categories} onChanged={onChanged} />

      <Section title="Policies">
        <Panel style={styles.policyPanel}>
          <PolicyRow label="Late work" value={course.late_policy} />
          <PolicyRow label="Attendance" value={course.attendance_policy} />
          {course.allowed_absences != null ? <PolicyRow label="Allowed absences" value={String(course.allowed_absences)} /> : null}
          <GradeBoundariesSection userId={userId} courseId={courseId} boundaries={gradeBoundaries} onChanged={onChanged} />
        </Panel>
      </Section>

      {/* U5, mirroring web. `course_office_hours` carried real data since the academic schema
          and nothing ever read it. SCREEN_SPEC §4's contextual surfacing (when a topic is
          repeatedly flagged confusing) is deliberately NOT built -- "repeatedly" needs a real
          threshold and inventing one would be the fabricated-constant failure this build has
          spent its time removing. */}
      <Section title="Office hours">
        {officeHours.length === 0 ? (
          <Text style={textStyle("bodyS", color.inkMuted)}>None recorded for this course.</Text>
        ) : (
          <Panel style={styles.policyPanel}>
            {officeHours.map((oh) => (
              <View key={oh.id} style={styles.officeHourRow}>
                <Text style={textStyle("body", color.ink)}>
                  {DAY_NAMES[oh.day_of_week] ?? `Day ${oh.day_of_week}`}{" "}
                  <Text style={textStyle("bodyS", color.inkMuted)}>
                    {formatClock(oh.start_time)}–{formatClock(oh.end_time)}
                  </Text>
                </Text>
                {oh.location ? <Text style={textStyle("caption", color.inkFaint)}>{oh.location}</Text> : null}
              </View>
            ))}
          </Panel>
        )}
      </Section>
    </View>
  );
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** `HH:MM:SS` from a Postgres `time` column into `2:00 PM`. No timezone conversion, ever:
 *  office hours are a recurring campus wall-clock slot, not an instant. */
function formatClock(value: string): string {
  const [h, m] = value.split(":");
  const hour = Number(h);
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${m} ${suffix}`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space[3] }}>
      <Text style={textStyle("label", color.inkMuted)}>{title}</Text>
      {children}
    </View>
  );
}

function PolicyRow({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={textStyle("label", color.inkMuted)}>{label}</Text>
      <Text style={textStyle("bodyS", color.ink)}>{value ?? "Not recorded"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.ground,
  },
  flex: {
    flex: 1,
    backgroundColor: "transparent",
  },
  content: {
    paddingHorizontal: space[5],
    gap: space[5],
  },
  errorBox: {
    gap: space[2],
    alignItems: "flex-start",
  },
  stack: {
    gap: space[7],
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: space[4],
  },
  riskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
  },
  metricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[7],
  },
  policyPanel: {
    gap: space[3],
  },
  boundaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[4],
  },
  officeHourRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space[3],
  },
});
