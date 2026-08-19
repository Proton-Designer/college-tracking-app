import { color, type as typeScale } from "@collegeos/design/native";
import { Tabs } from "expo-router";
import { StyleSheet } from "react-native";
import { resolveFontFamily } from "../../design/fonts";

/**
 * SCREEN_SPEC §0 — mobile bottom tabs: Today · Courses · Review · Insights. Calendar is a
 * segment inside Courses, not a fifth tab. Settings lives in the Today header, not here.
 * Text-only, same reasoning as web's NavRail: no icon set exists in this codebase, and
 * inventing one to fill a tab bar isn't worth a new dependency for four labels.
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.accent,
        tabBarInactiveTintColor: color.inkMuted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen name="today" options={{ title: "Today" }} />
      <Tabs.Screen name="courses" options={{ title: "Courses" }} />
      <Tabs.Screen name="review" options={{ title: "Review" }} />
      <Tabs.Screen name="insights" options={{ title: "Insights" }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: color.surface,
    borderTopColor: color.hairline,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tabLabel: {
    fontFamily: resolveFontFamily(typeScale.bodyS),
    fontSize: typeScale.bodyS.fontSize,
  },
});
