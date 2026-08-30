import { Tabs } from "expo-router";
import { Island } from "../../components/shell/Island";

/**
 * Mobile bottom tabs: Today · Learn · Life · Self · Review — the merged app's IA, complete.
 * Calendar is a segment inside Courses, not a separate tab. Settings lives in the Today header,
 * not here.
 *
 * **Every tab arrived only when its destination was real.** That was the rule throughout: a tab
 * opening a "coming soon" screen is scaffolding wearing an empty state's clothes rather than an
 * honest one (D40). Life joined when its fifth domain shipped, Learn when the daily session ran
 * against real lessons, Self when a dimension could show the acts behind its number.
 *
 * **Life arrived when its last domain did.** The rule is that a tab joins the dock when its
 * destination is real, and Life's destination is five real domain surfaces: Deen, Business,
 * School, Fitness and Work all exist now. Courses gave up its tab to it and moved to
 * `app/courses/index.tsx` — the route is unchanged (`/courses`) and it is reached from Life's
 * School card, which is where the merged IA puts it (DESIGN_LANGUAGE_V3 §4.1). A phone can show
 * five destinations, so on mobile the five tabs are the whole IA and the domains live inside the
 * hub; the web sidebar unfolds the same architecture and lists them directly.
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
      <Tabs.Screen name="learn" options={{ title: "Learn" }} />
      <Tabs.Screen name="life" options={{ title: "Life" }} />
      <Tabs.Screen name="self" options={{ title: "Self" }} />
      <Tabs.Screen name="review" options={{ title: "Review" }} />
    </Tabs>
  );
}
