import { color, space, type as typeScale } from "@collegeos/design/native";
import { Tabs } from "expo-router";
import { StyleSheet, View } from "react-native";
import { resolveFontFamily } from "../../design/fonts";

/**
 * SCREEN_SPEC §0 — mobile bottom tabs: Today · Courses · Review · Insights. Calendar is a
 * segment inside Courses, not a fifth tab. Settings lives in the Today header, not here.
 * Text-only, same reasoning as web's NavRail: no icon set exists in this codebase, and
 * inventing one to fill a tab bar isn't worth a new dependency for four labels. The active
 * indicator below repurposes the icon slot with a hairline accent bar instead -- the same
 * "layered hairlines, not shapes" language NavRail's left border uses, translated to a
 * horizontal bar since a bottom tab bar has no left edge to indicate against.
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
        tabBarIcon: ({ focused }) => (
          <View style={[styles.activeIndicator, focused ? styles.activeIndicatorOn : null]} />
        ),
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
  activeIndicator: {
    width: 20,
    height: 2,
    borderRadius: 1,
    marginBottom: space[1],
    backgroundColor: "transparent",
  },
  activeIndicatorOn: {
    backgroundColor: color.accent,
  },
});
