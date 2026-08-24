import { Tabs } from "expo-router";
import { Island } from "../../components/shell/Island";

/**
 * SCREEN_SPEC §0 — mobile bottom tabs: Today · Courses · Review · Insights. Calendar is a
 * segment inside Courses, not a fifth tab. Settings lives in the Today header, not here.
 *
 * DESIGN_LANGUAGE_V2 §5 — the tab bar is the floating glass Island, not the default in-flow
 * bar: `tabBar` replaces react-navigation's own bar entirely, so it renders detached and
 * absolutely positioned instead of reserving space in the Tabs navigator's layout. That's the
 * other half of the `TabScreenScrollView` fix -- see its own comment.
 */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <Island {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      {/* D24: the Work Engine merged into Today as its base; the separate Hours tab is
          retired. Today is the default open, so the merged surface is the default. */}
      <Tabs.Screen name="today" options={{ title: "Today" }} />
      <Tabs.Screen name="courses" options={{ title: "Courses" }} />
      <Tabs.Screen name="review" options={{ title: "Review" }} />
      <Tabs.Screen name="insights" options={{ title: "Insights" }} />
    </Tabs>
  );
}
