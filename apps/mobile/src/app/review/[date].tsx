import { LENS_NAMES } from "@collegeos/api";
import type { AgentReport, DeterministicNightlyReport, Intervention, LensName, NightlyAgentReportPayload } from "@collegeos/api";
import { color, space } from "@collegeos/design/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FrictionDistributionSection } from "../../components/insights/FrictionDistributionSection";
import { PlanningExecutionQuadrant } from "../../components/insights/PlanningExecutionQuadrant";
import { claimsWithEvidence, EvidenceClaimList } from "../../components/review/EvidenceClaimList";
import { ReportHistoryList } from "../../components/review/ReportHistoryList";
import { Button, Metric, NavLink, RiskPill, Skeleton } from "../../components/ui";
import { serifBodyStyle, textStyle } from "../../design/typography";
import { useReviewReportData } from "../../lib/useReviewReportData";

function formatFullDate(localDate: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${localDate}T00:00:00Z`),
  );
}

function urgencyBand(urgency: string): "low" | "moderate" | "critical" {
  if (urgency === "high") return "critical";
  if (urgency === "medium") return "moderate";
  return "low";
}
const URGENCY_LABEL: Record<string, string> = { low: "LOW", medium: "MODERATE", high: "HIGH" };

const LENS_LABEL: Record<LensName, string> = {
  executive_coach: "Executive Coach",
  academic_strategist: "Academic Strategist",
  behavior_analyst: "Behavior Analyst",
  skeptic: "Skeptic",
  systems_engineer: "Systems Engineer",
  motivator: "Motivator",
  recovery_coach: "Recovery Coach",
};

/** Ported from web's /review/[date]. Reached by pushing from the Review tab's history
 *  link -- no native back header, an explicit "Review" link at the top instead, same
 *  affordance as courses/[id].tsx and focus/[sessionId].tsx. */
export default function ReviewReportScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const isValidDate = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date);
  // Keyed by date so navigating between history-rail dates (a param change on the same
  // route, not a fresh push) fully remounts this subtree instead of showing the previous
  // date's report while the new one loads.
  return isValidDate ? <ReviewReportForDate key={date} date={date} /> : <ReviewReportInvalidDate />;
}

function ReviewReportInvalidDate() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <ScrollView style={styles.flex} contentContainerStyle={[styles.content, { paddingTop: insets.top + space[6], paddingBottom: insets.bottom + space[8] }]}>
      <NavLink label="Review" direction="back" onPress={() => router.back()} />
      <Text style={textStyle("body", color.inkMuted)}>Not a valid date.</Text>
    </ScrollView>
  );
}

function ReviewReportForDate({ date }: { date: string }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const result = useReviewReportData(date);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={[styles.content, { paddingTop: insets.top + space[6], paddingBottom: insets.bottom + space[8] }]}>
      <NavLink label="Review" direction="back" onPress={() => router.back()} />

      {result.status === "loading" ? (
        <View style={{ gap: space[4] }}>
          <Skeleton height={40} width={220} />
          <Skeleton height={80} radius="lg" />
          <Skeleton height={160} radius="lg" />
        </View>
      ) : null}

      {result.status === "error" ? (
        <View style={styles.errorBox}>
          <Text style={textStyle("label", color.riskCritical)}>Couldn&apos;t load this report</Text>
          <Text style={textStyle("body", color.inkMuted)}>{result.error}</Text>
          <Button variant="secondary" onPress={result.refetch}>
            Try again
          </Button>
        </View>
      ) : null}

      {result.status === "ready" ? <ReportBody date={date} payload={result.data.payload} history={result.data.history} /> : null}
    </ScrollView>
  );
}

function ReportBody({
  date,
  payload,
  history,
}: {
  date: string;
  payload: NightlyAgentReportPayload | null;
  history: AgentReport[];
}) {
  return (
    <View style={styles.stack}>
      <View style={{ gap: space[3] }}>
        <Text style={textStyle("label", color.inkMuted)}>History</Text>
        <ReportHistoryList history={history} currentDate={date} />
      </View>

      {!payload ? (
        <View style={{ gap: space[3] }}>
          <Text style={textStyle("displayM", color.ink)}>{formatFullDate(date)}</Text>
          <Text style={textStyle("body", color.inkMuted)}>No report was generated for this date.</Text>
        </View>
      ) : (
        <ReportContent payload={payload} />
      )}
    </View>
  );
}

function ReportContent({ payload }: { payload: NightlyAgentReportPayload }) {
  const { deterministic, analysis, note } = payload;
  // The deterministic headline/summary are generated with zero model involvement and
  // populated on every report -- the report opens with real prose on every night, not
  // just the nights the model layer ran. Analysis, when present, supersedes it with the
  // richer model-derived version.
  const headline = analysis?.headline ?? deterministic.headline;
  const objectiveSummary = analysis?.objective_summary ?? deterministic.objectiveSummary;
  const gapsToShow = [...deterministic.dataGaps, ...(analysis?.data_gaps ?? [])];
  const activeLenses = analysis
    ? LENS_NAMES.map((name) => ({ name, text: analysis.lenses[name] })).filter((lens) => lens.text.trim().length > 0)
    : [];

  return (
    <View style={styles.article}>
      <Text style={textStyle("displayM", color.ink)}>{headline}</Text>

      <Text style={serifBodyStyle(color.ink)}>{objectiveSummary}</Text>
      {!analysis && note ? <Text style={textStyle("caption", color.inkFaint)}>{note}</Text> : null}

      {analysis && claimsWithEvidence(analysis.wins).length > 0 ? (
        <Section title="Wins">
          <EvidenceClaimList claims={analysis.wins} />
        </Section>
      ) : null}

      {analysis && claimsWithEvidence(analysis.failures).length > 0 ? (
        <Section title="Failures">
          <EvidenceClaimList claims={analysis.failures} />
        </Section>
      ) : null}

      {analysis && claimsWithEvidence(analysis.planning_errors).length > 0 ? (
        <Section title="Planning errors">
          <EvidenceClaimList claims={analysis.planning_errors} />
        </Section>
      ) : null}

      {analysis && claimsWithEvidence(analysis.behavior_patterns).length > 0 ? (
        <Section title="Behavior patterns">
          <EvidenceClaimList claims={analysis.behavior_patterns} />
        </Section>
      ) : null}

      {analysis && analysis.academic_risks.length > 0 ? (
        <Section title="Academic risks">
          <View style={{ gap: space[3] }}>
            {analysis.academic_risks.map((risk, i) => (
              <View key={i} style={styles.riskRow}>
                <Text style={[textStyle("body", color.ink), styles.riskNote]}>{risk.note}</Text>
                <RiskPill band={urgencyBand(risk.urgency)} label={URGENCY_LABEL[risk.urgency] ?? risk.urgency.toUpperCase()} />
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      {activeLenses.length > 0 ? (
        <Section title="The lenses">
          <View style={{ gap: space[5] }}>
            {activeLenses.map((lens) => (
              <View key={lens.name} style={{ gap: 2 }}>
                <Text style={textStyle("label", color.inkFaint)}>{LENS_LABEL[lens.name]}</Text>
                <Text style={serifBodyStyle(color.ink)}>{lens.text}</Text>
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      {analysis && analysis.tomorrow_changes.length > 0 ? (
        <Section title="Tomorrow's changes">
          <InterventionList items={analysis.tomorrow_changes} />
        </Section>
      ) : null}

      {analysis?.kill_list_intervention ? (
        <Section title="Kill-list intervention">
          <InterventionList items={[analysis.kill_list_intervention]} />
        </Section>
      ) : null}

      {gapsToShow.length > 0 ? (
        <Section title="What this report couldn't assess">
          <View style={{ gap: 2 }}>
            {gapsToShow.map((gap, i) => (
              <Text key={i} style={textStyle("bodyS", color.inkFaint)}>
                {gap}
              </Text>
            ))}
          </View>
        </Section>
      ) : null}

      <View style={styles.hr} />

      <DeterministicSections report={deterministic} />
    </View>
  );
}

function InterventionList({ items }: { items: Intervention[] }) {
  return (
    <View style={{ gap: space[4] }}>
      {items.map((item, i) => (
        <View key={i} style={{ gap: 2 }}>
          <Text style={textStyle("body", color.ink)}>{item.description}</Text>
          <Text style={textStyle("bodyS", color.inkMuted)}>{item.rationale}</Text>
        </View>
      ))}
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

/** The primary case, not a fallback: with no ANTHROPIC_API_KEY, this is what actually
 *  renders for every real date. Genuinely useful on its own -- numbers, traces, bands. */
function DeterministicSections({ report }: { report: DeterministicNightlyReport }) {
  return (
    <View style={styles.stack}>
      <Section title="The night, measured">
        <View style={styles.metricRow}>
          {report.review ? (
            <>
              <Metric label="MITs" value={`${report.review.mitsCompleted}/${report.review.mitsPlanned}`} />
              {report.review.deepWorkActualMin != null ? <Metric label="Deep work" value={report.review.deepWorkActualMin} unit="min" /> : null}
              {report.review.screenTimeMin != null ? <Metric label="Screen time" value={report.review.screenTimeMin} unit="min" /> : null}
            </>
          ) : null}
          {report.checkin ? (
            <>
              <Metric label="Energy" value={report.checkin.energy} unit="/10" />
              <Metric label="Mood" value={report.checkin.mood} unit="/10" />
            </>
          ) : null}
        </View>
        {!report.checkin && !report.review ? <Text style={textStyle("bodyS", color.inkFaint)}>No check-in or review recorded for this day.</Text> : null}
      </Section>

      <Section title="Recovery Mode">
        {report.recoveryMode.triggered ? (
          <View style={{ gap: space[2] }}>
            <Text style={textStyle("body", color.ink)}>Triggered.</Text>
            <View style={{ gap: 2 }}>
              {report.recoveryMode.signals
                .filter((s) => s.active)
                .map((s) => (
                  <Text key={s.key} style={textStyle("caption", color.inkFaint)}>
                    {s.key} ({s.points}pt, {s.class})
                  </Text>
                ))}
            </View>
          </View>
        ) : (
          <Text style={textStyle("bodyS", color.inkMuted)}>Not triggered.</Text>
        )}
      </Section>

      <Section title="Planning vs. execution">
        <PlanningExecutionQuadrant result={report.planningExecution} />
      </Section>

      <Section title="Course risk">
        {report.riskAssessment.courseRisks.length === 0 ? (
          <Text style={textStyle("bodyS", color.inkFaint)}>No courses to assess.</Text>
        ) : (
          <View style={{ gap: space[3] }}>
            {report.riskAssessment.courseRisks.map((cr) => (
              <View key={cr.courseId} style={styles.riskRow}>
                <Text style={[textStyle("bodyS", color.inkMuted), styles.riskNote]}>
                  {cr.courseCode} <Text style={{ color: color.inkFaint }}>{cr.courseName}</Text>
                </Text>
                <View style={styles.riskBandRow}>
                  <RiskPill band={cr.result.band} label={cr.result.band.toUpperCase()} />
                  <Text style={textStyle("bodyS", color.inkFaint)}>{cr.result.score}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </Section>

      <Section title="Friction">
        <FrictionDistributionSection distribution={report.frictionToday} trend={report.frictionTrend} />
      </Section>

      <Section title="Kill list">
        {report.killLoop.length === 0 ? (
          <Text style={textStyle("bodyS", color.inkFaint)}>No active kill-list habits.</Text>
        ) : (
          <View style={{ gap: space[3] }}>
            {report.killLoop.map((k) => (
              <View key={k.killHabitId} style={styles.riskRow}>
                <Text style={textStyle("bodyS", color.ink)}>{k.name}</Text>
                <Text style={textStyle("bodyS", color.inkMuted)}>
                  {k.relapsesToday > 0 ? `${k.relapsesToday} relapse today` : k.eventsToday > 0 ? "resisted today" : "no events today"}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Section>

      <Section title="Focus sessions">
        <View style={styles.metricRow}>
          <Metric label="Sessions" value={report.focusSessions.count} />
          <Metric label="Completed" value={report.focusSessions.completedCount} />
          <Metric label="Total time" value={report.focusSessions.totalActualMin} unit="min" />
          <Metric label="Interruptions" value={report.focusSessions.totalInterruptions} />
        </View>
      </Section>
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
    gap: space[7],
  },
  errorBox: {
    gap: space[2],
    alignItems: "flex-start",
  },
  stack: {
    gap: space[7],
  },
  article: {
    gap: space[6],
  },
  hr: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.hairline,
  },
  metricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[7],
  },
  riskRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[3],
  },
  riskNote: {
    flexShrink: 1,
  },
  riskBandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
  },
});
