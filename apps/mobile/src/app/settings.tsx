import { color, space } from "@collegeos/design/native";
import { Stack } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DataExportDeletionSection } from "../components/settings/DataExportDeletionSection";
import { IntegrationsSection } from "../components/settings/IntegrationsSection";
import { KillHabitsSection } from "../components/settings/KillHabitsSection";
import { LlmBudgetSection } from "../components/settings/LlmBudgetSection";
import { ProfileSection } from "../components/settings/ProfileSection";
import { Button, Skeleton } from "../components/ui";
import { textStyle } from "../design/typography";
import { useSettingsData } from "../lib/useSettingsData";

/** SCREEN_SPEC §0/§9 — reachable from the Today header, not a tab. */
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const result = useSettingsData();

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space[6], paddingBottom: insets.bottom + space[8] }]}
    >
      <Stack.Screen options={{ headerShown: true, title: "Settings", headerBackButtonDisplayMode: "minimal" }} />

      {result.status === "loading" ? (
        <View style={{ gap: space[4] }}>
          <Skeleton height={140} radius="lg" />
          <Skeleton height={100} radius="lg" />
          <Skeleton height={140} radius="lg" />
        </View>
      ) : null}

      {result.status === "error" ? (
        <View style={{ gap: space[3], alignItems: "flex-start" }}>
          <Text style={textStyle("label", color.riskCritical)}>Couldn&apos;t load settings</Text>
          <Text style={textStyle("body", color.inkMuted)}>{result.error}</Text>
          <Button variant="secondary" onPress={result.refetch}>
            Try again
          </Button>
        </View>
      ) : null}

      {result.status === "ready" ? (
        <View style={{ gap: space[8] }}>
          <Section title="Profile & timezone">
            <ProfileSection userId={result.data.userId} profile={result.data.profile} />
          </Section>

          <Section title="Kill-list habits">
            <KillHabitsSection userId={result.data.userId} killHabits={result.data.killHabits} />
          </Section>

          <Section title="Integrations">
            <IntegrationsSection
              userId={result.data.userId}
              integrationStatuses={result.data.integrationStatuses}
              brightspaceFeed={result.data.brightspaceFeed}
            />
          </Section>

          <Section title="LLM budget & spend">
            <LlmBudgetSection
              userId={result.data.userId}
              profile={result.data.profile}
              monthlySpend={result.data.monthlySpend}
              hasEverCalledModel={result.data.hasEverCalledModel}
            />
          </Section>

          <Section title="Data export & deletion">
            <DataExportDeletionSection userEmail={result.data.profile.email} />
          </Section>
        </View>
      ) : null}
    </ScrollView>
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

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: color.ground,
  },
  content: {
    paddingHorizontal: space[5],
    gap: space[6],
  },
});
