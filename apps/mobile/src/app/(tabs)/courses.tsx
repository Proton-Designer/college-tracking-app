import { color, space } from "@collegeos/design/native";
import { ScrollView, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState } from "../../components/ui";
import { textStyle } from "../../design/typography";

/** Mobile parity for Courses/Semester Map/Calendar is a separate, later assignment --
 *  this is an honest "not built yet" placeholder, not a stubbed-empty real screen. */
export default function CoursesScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space[6], paddingBottom: insets.bottom + space[8] }]}
    >
      <Text style={textStyle("displayM", color.ink)}>Courses</Text>
      <EmptyState
        title="Not built yet"
        description="This will show your courses by risk, and — as a segment here rather than a fifth tab — the deadline calendar. Nothing here is real until it's built."
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
