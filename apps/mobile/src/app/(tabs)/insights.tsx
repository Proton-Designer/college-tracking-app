import { color, space } from "@collegeos/design/native";
import { ScrollView, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState } from "../../components/ui";
import { textStyle } from "../../design/typography";

export default function InsightsScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space[6], paddingBottom: insets.bottom + space[8] }]}
    >
      <Text style={textStyle("displayM", color.ink)}>Insights</Text>
      <EmptyState
        title="Not built yet"
        description="This will group insights by confidence — measured, indicated, hypothesis — plus the task-duration calibration table, friction cause distribution, bounce-back trend, and the planning-vs-execution quadrant. Nothing here is real until it's built."
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
