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
      <Tabs.Screen name="today" options={{ title: "Today" }} />
      {/* The Work Engine. Labelled "Hours" rather than "Day" so it does not read as a second
          "Today" -- Part VIII keeps the vocabulary tiny and "Hour" is the atomic unit. Placed
          second rather than first: making it the app's landing surface is a product decision,
          not a wiring one, and post-login still routes to /today. */}
      <Tabs.Screen name="day" options={{ title: "Hours" }} />
      <Tabs.Screen name="courses" options={{ title: "Courses" }} />
      <Tabs.Screen name="review" options={{ title: "Review" }} />
      <Tabs.Screen name="insights" options={{ title: "Insights" }} />
    </Tabs>
  );
}
