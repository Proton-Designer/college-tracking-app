import { color, space } from "@collegeos/design/native";
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, type RefreshControlProps, type ScrollViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTabBarClearance } from "../../design/layout";

export interface TabScreenScrollViewProps {
  children: ReactNode;
  refreshControl?: ScrollViewProps["refreshControl"];
}

/**
 * The shared scroll container for every screen inside the `(tabs)` group. Applies safe-area
 * top padding and `useTabBarClearance()` as a `marginBottom` on the ScrollView itself (not
 * `contentContainerStyle` padding -- confirmed live, twice, that padding alone doesn't
 * un-hide bottom content from behind the tab bar; see `design/layout.ts`). One place to
 * fix if this ever needs adjusting, instead of four screens quietly drifting apart.
 */
export function TabScreenScrollView({ children, refreshControl }: TabScreenScrollViewProps) {
  const insets = useSafeAreaInsets();
  const tabBarClearance = useTabBarClearance();

  return (
    <ScrollView
      style={[styles.flex, { marginBottom: tabBarClearance }]}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space[6], paddingBottom: space[8] }]}
      refreshControl={refreshControl as React.ReactElement<RefreshControlProps> | undefined}
    >
      {children}
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
