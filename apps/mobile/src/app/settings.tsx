import { color, space } from "@collegeos/design/native";
import { Stack } from "expo-router";
import { ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState } from "../components/ui";

/** SCREEN_SPEC §0 — reachable from the Today header, not a tab. */
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space[6], paddingBottom: insets.bottom + space[8] }]}
    >
      {/* headerBackButtonDisplayMode: "minimal" -- without it iOS falls back to the previous
          route's name as the back-button label, which leaked the literal "(tabs)" route-group
          folder name onto screen (found live on-device, not in review). A chevron-only back
          button sidesteps needing any label at all. */}
      <Stack.Screen options={{ headerShown: true, title: "Settings", headerBackButtonDisplayMode: "minimal" }} />
      <EmptyState
        title="Not built yet"
        description="This will hold profile and timezone, integrations (WHOOP, Brightspace, RescueTime, calendar), notification preferences, kill-habit definitions, commitment escalation levels, LLM budget, and data export and deletion. Nothing here is real until it's built."
      />
    </ScrollView>
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
