import { listAgentReports, type AgentReport } from "@collegeos/api";
import { color, space } from "@collegeos/design/native";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";
import { getMobileSupabaseClient } from "../../lib/supabase/client";
import { Panel } from "../ui";

/**
 * The weekly narrative -- weekly-synthesis has been writing these since Tier 4 and
 * nothing displayed them prominently (the recorded gap). Renders the latest weekly
 * agent report's model analysis when one exists; when the model path didn't run, it
 * says so and shows nothing fabricated -- the deterministic numbers already live in
 * the panels above this one, and repeating them here as prose would be decoration.
 */

interface WeeklyAnalysisShape {
  headline: string;
  objective_summary: string;
  plan_accuracy_note: string;
  academic_note: string;
  behavior_note: string;
  health_note: string;
  system_failure: ({ claim?: string } | string)[];
  proposed_experiment: { hypothesis: string; protocol: string; rationale: string } | null;
}

function readAnalysis(report: AgentReport): WeeklyAnalysisShape | null {
  const payload = report.payload as { analysis?: unknown } | null;
  const analysis = payload?.analysis as WeeklyAnalysisShape | null | undefined;
  if (analysis == null || typeof analysis.headline !== "string") return null;
  return analysis;
}

export function WeeklyNarrativePanel({ userId: _userId }: { userId: string }) {
  const [report, setReport] = useState<AgentReport | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void listAgentReports(getMobileSupabaseClient(), "weekly", 1).then((r) => {
      if (r.ok && r.data.length > 0) setReport(r.data[0]!);
      setLoaded(true);
    });
  }, []);

  if (!loaded || report == null) return null;
  const analysis = readAnalysis(report);

  return (
    <Panel>
      <Text style={textStyle("label", color.inkMuted)}>Weekly synthesis — week of {report.local_date}</Text>
      {analysis == null ? (
        <Text style={[textStyle("bodyS", color.inkMuted), styles.spacedTop]}>
          The deterministic synthesis ran; the model narrative didn&apos;t (no key at the time, or
          it degraded). The numbers above are the synthesis.
        </Text>
      ) : (
        <>
          <Text style={[textStyle("bodyL", color.ink), styles.spacedTop]}>{analysis.headline}</Text>
          <Text style={[textStyle("bodyS", color.ink), styles.spacedTop]}>{analysis.objective_summary}</Text>
          {[
            ["Plan accuracy", analysis.plan_accuracy_note],
            ["Academics", analysis.academic_note],
            ["Behavior", analysis.behavior_note],
            ["Health", analysis.health_note],
          ].map(([label, note]) => (
            <View key={label} style={styles.spacedTop}>
              <Text style={textStyle("label", color.inkMuted)}>{label}</Text>
              <Text style={textStyle("bodyS", color.ink)}>{note}</Text>
            </View>
          ))}
          {analysis.system_failure.length > 0 ? (
            <View style={styles.spacedTop}>
              <Text style={textStyle("label", color.riskHigh)}>System failure — what about CollegeOS isn&apos;t working</Text>
              {analysis.system_failure.map((item, i) => (
                <Text key={i} style={textStyle("bodyS", color.ink)}>
                  · {typeof item === "string" ? item : item.claim ?? ""}
                </Text>
              ))}
            </View>
          ) : null}
          {analysis.proposed_experiment != null ? (
            <View style={styles.spacedTop}>
              <Text style={textStyle("label", color.inkMuted)}>Proposed experiment</Text>
              <Text style={textStyle("bodyS", color.ink)}>{analysis.proposed_experiment.hypothesis}</Text>
              <Text style={textStyle("caption", color.inkFaint)}>{analysis.proposed_experiment.protocol}</Text>
            </View>
          ) : null}
        </>
      )}
    </Panel>
  );
}

const styles = StyleSheet.create({
  spacedTop: { marginTop: space[3] },
});
