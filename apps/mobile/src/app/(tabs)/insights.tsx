import { color, space } from "@collegeos/design/native";
import { Text, View } from "react-native";
import { DecisionJournal } from "../../components/insights/DecisionJournal";
import { ActiveExperiments } from "../../components/insights/ActiveExperiments";
import { BounceBackSection } from "../../components/insights/BounceBackSection";
import { CalibrationTable } from "../../components/insights/CalibrationTable";
import { FrictionDistributionSection } from "../../components/insights/FrictionDistributionSection";
import { InsightsList } from "../../components/insights/InsightsList";
import { PlanningExecutionQuadrant } from "../../components/insights/PlanningExecutionQuadrant";
import { Button, Skeleton, TabScreenScrollView } from "../../components/ui";
import { textStyle } from "../../design/typography";
import { useAuthSession } from "../../lib/useAuthSession";
import { useInsightsData } from "../../lib/useInsightsData";

export default function InsightsScreen() {
  const { session } = useAuthSession();
  const result = useInsightsData();

  return (
    <TabScreenScrollView>
      <Text style={textStyle("displayM", color.ink)}>Insights</Text>

      {result.status === "loading" ? (
        <View style={{ gap: space[4] }}>
          <Skeleton height={80} radius="lg" />
          <Skeleton height={120} radius="lg" />
          <Skeleton height={80} radius="lg" />
        </View>
      ) : null}

      {result.status === "error" ? (
        <View style={{ gap: space[3], alignItems: "flex-start" }}>
          <Text style={textStyle("label", color.riskCritical)}>Couldn&apos;t load insights</Text>
          <Text style={textStyle("body", color.inkMuted)}>{result.error}</Text>
          <Button variant="secondary" onPress={result.refetch}>
            Try again
          </Button>
        </View>
      ) : null}

      {result.status === "ready" && session?.user.id ? (
        <View style={{ gap: space[8] }}>
          <InsightsList userId={session.user.id} insightsByTier={result.data.insightsByTier} />

          <Section title="Active experiments">
            <ActiveExperiments
              experiments={result.data.activeExperiments}
              today={result.data.today}
              userId={session.user.id}
              onChanged={result.refetch}
            />
          </Section>

          {/* U7 sits beside experiments on purpose: both are observe-then-score, and seeing
              an unscored decision next to an unscored trial is what makes closing the loop a
              habit rather than a feature. */}
          <Section title="Decision journal">
            <DecisionJournal
              decisions={result.data.decisions}
              userId={session.user.id}
              onChanged={result.refetch}
            />
          </Section>

          <Section title="Task-duration calibration">
            <CalibrationTable rows={result.data.calibrationTable} />
          </Section>

          <Section title="Friction, last 30 days">
            <FrictionDistributionSection distribution={result.data.frictionDistribution} trend={result.data.frictionTrend} />
          </Section>

          <Section title="Bounce-back">
            <BounceBackSection items={result.data.bounceBackByHabit} />
          </Section>

          <Section title="Planning vs. execution — yesterday">
            <PlanningExecutionQuadrant result={result.data.planningExecution} />
          </Section>
        </View>
      ) : null}
    </TabScreenScrollView>
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
