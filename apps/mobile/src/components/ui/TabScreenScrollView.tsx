import { color, island, space } from "@collegeos/design/native";
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, type RefreshControlProps, type ScrollViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface TabScreenScrollViewProps {
  children: ReactNode;
  refreshControl?: ScrollViewProps["refreshControl"];
  /** Omits the ScrollView's own opaque `color.ground` fill -- for the one screen (`/today`)
   *  that mounts its own `Aurora` behind the scroll content and needs it to show through. */
  transparent?: boolean;
}

/**
 * The shared scroll container for every screen inside the `(tabs)` group. The island tab bar
 * (`components/shell/Island.tsx`) is absolutely positioned and detached, so the Tabs navigator
 * no longer reserves any space for it in normal flow -- content genuinely extends to the bottom
 * edge, and the only correct treatment is `contentContainerStyle.paddingBottom`, never a
 * `marginBottom` on the ScrollView itself (that double-counts space nothing is reserving).
 */
export function TabScreenScrollView({ children, refreshControl, transparent = false }: TabScreenScrollViewProps) {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={[styles.flex, transparent ? styles.transparent : null]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space[6], paddingBottom: island.contentInset + insets.bottom },
      ]}
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
  transparent: {
    backgroundColor: "transparent",
  },
  content: {
    paddingHorizontal: space[5],
    gap: space[6],
  },
});
