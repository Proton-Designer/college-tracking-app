import { color, space } from "@collegeos/design/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AssignmentsTable } from "../../components/courses/AssignmentsTable";
import { CourseRiskPanel } from "../../components/courses/CourseRiskPanel";
import { ScenarioPlanner } from "../../components/courses/ScenarioPlanner";
import { Button, Metric, Panel, RiskPill, Skeleton } from "../../components/ui";
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

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space[6], paddingBottom: insets.bottom + space[8] }]}
    >
      <Pressable onPress={() => router.back()} hitSlop={8}>
        <Text style={textStyle("caption", color.inkFaint)}>← Courses</Text>
      </Pressable>

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
        <CourseDetailReady userId={session.user.id} courseId={courseId} data={result.data} />
      ) : null}
    </ScrollView>
  );
}

function CourseDetailReady({
  userId,
  courseId,
  data,
}: {
  userId: string;
  courseId: number;
  data: CourseDetailData;
}) {
  const { course, gradeResult, courseRisk, deliverableRisks, today, categories, gradeItems, gradeBoundaries, deliverables, backplanChains } = data;
  const weightSumIssue = gradeResult?.issues.find((i) => i.kind === "weightSumWarning");
  const categoryNameById = new Map(categories.map((c) => [String(c.id), c.name]));

  return (
    <View style={styles.stack}>
      <View style={{ gap: space[1] }}>
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
              <Text style={textStyle("bodyS", color.inkFaint)}>{courseRisk.result.score}</Text>
            </View>
          ) : null}
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
        <View style={styles.warningBox}>
          <Text style={textStyle("bodyS", color.riskHigh)}>
            {weightSumIssue.message} — category weights are never silently normalized, so this course&apos;s grade math is provisional until
            the weights add up to 100.
          </Text>
        </View>
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

      <Section title="Why this score">
        <CourseRiskPanel deliverableRisks={deliverableRisks} today={today} />
      </Section>

      <Section title="Assignments & exams">
        <AssignmentsTable deliverables={deliverables} gradeItems={gradeItems} categories={categories} backplanChains={backplanChains} today={today} />
      </Section>

      <Section title="Policies">
        <Panel style={styles.policyPanel}>
          <PolicyRow label="Late work" value={course.late_policy} />
          <PolicyRow label="Attendance" value={course.attendance_policy} />
          {course.allowed_absences != null ? <PolicyRow label="Allowed absences" value={String(course.allowed_absences)} /> : null}
          {gradeBoundaries.length > 0 ? (
            <View style={{ gap: 2 }}>
              <Text style={textStyle("label", color.inkMuted)}>Grade boundaries</Text>
              <View style={styles.boundaryRow}>
                {gradeBoundaries.map((b) => (
                  <Text key={b.id} style={textStyle("bodyS", color.ink)}>
                    {b.letter} {Math.round(b.min_pct)}%+
                  </Text>
                ))}
              </View>
            </View>
          ) : (
            <PolicyRow label="Grade boundaries" value={null} />
          )}
        </Panel>
      </Section>
    </View>
  );
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
  flex: {
    flex: 1,
    backgroundColor: color.ground,
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
  warningBox: {
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.riskHigh,
    backgroundColor: color.riskHighWash,
    padding: space[4],
  },
  policyPanel: {
    gap: space[3],
  },
  boundaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[4],
  },
});
