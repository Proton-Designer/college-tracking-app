import { color } from "@collegeos/design/native";
import { Text } from "react-native";
import { EmptyState, TabScreenScrollView } from "../../components/ui";
import { textStyle } from "../../design/typography";

export default function InsightsScreen() {
  return (
    <TabScreenScrollView>
      <Text style={textStyle("displayM", color.ink)}>Insights</Text>
      <EmptyState
        title="Not built yet"
        description="This will group insights by confidence — measured, indicated, hypothesis — plus the task-duration calibration table, friction cause distribution, bounce-back trend, and the planning-vs-execution quadrant. Nothing here is real until it's built."
      />
    </TabScreenScrollView>
  );
}
