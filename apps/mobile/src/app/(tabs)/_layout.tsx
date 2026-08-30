import { Tabs } from "expo-router";
import { Island } from "../../components/shell/Island";

/**
 * Mobile bottom tabs: Today · Courses · Review. Calendar is a segment inside Courses, not a
 * fourth tab. Settings lives in the Today header, not here.
 *
 * **Where this is going.** The merged app's IA is five tabs — Today · Learn · Life · Self ·
 * Review — with Courses folding into Life▸School. Each of those joins this navigator on the day
 * its destination becomes real (Life's domains in Phase 2, Learn in Phase 4, Self in Phase 5),
 * because a tab that opens a "coming soon" screen is scaffolding wearing an empty state's clothes
 * rather than an honest one (D40).
 *
 * Insights is gone as a tab: it merged into Review (collision M7), so "how am I doing" has one
 * destination instead of two competing ones.
 *
 * The tab bar is the floating glass Island, not the default in-flow bar: `tabBar` replaces
 * react-navigation's own bar entirely, so it renders detached and absolutely positioned instead
 * of reserving space in the Tabs navigator's layout. That's the other half of the
 * `TabScreenScrollView` fix -- see its own comment.
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
    </Tabs>
  );
}
