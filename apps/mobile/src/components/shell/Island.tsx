import { BarChart3, BookOpen, ClipboardCheck, Home } from "lucide-react-native";
import { BlurView } from "expo-blur";
import type { BottomTabBarProps } from "expo-router/tabs";
import { Fragment } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import { color, duration, island, radius, shadow, space, type as typeScale } from "@collegeos/design/native";
import { resolveFontFamily } from "../../design/fonts";

/**
 * DESIGN_LANGUAGE_V2 §5 — the primary nav on both platforms: a floating, detached, near-black
 * glass dock. Rendered as a custom `tabBar` (not the default in-flow bar), so it never
 * participates in the Tabs navigator's own layout -- see `(tabs)/_layout.tsx` and
 * `TabScreenScrollView`'s `island.contentInset` padding, which is the other half of this.
 */

type IconComponent = typeof Home;

const ICON_BY_ROUTE: Record<string, IconComponent> = {
  today: Home,
  courses: BookOpen,
  review: ClipboardCheck,
  insights: BarChart3,
};

/** `island.fill` composed with `fillAlpha` -- the tint layer sits over the blur, per §5/§2. */
function islandTint(): string {
  const alphaHex = Math.round(island.fillAlpha * 255)
    .toString(16)
    .padStart(2, "0");
  return `${island.fill}${alphaHex}`;
}

export function Island({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  return (
    <View
      style={[styles.wrapper, { bottom: insets.bottom + island.offset }]}
      pointerEvents="box-none"
    >
      <View style={styles.dockShadow}>
        <View style={styles.dockClip}>
          {/* Mandatory opaque fallback (§2): the tint View below is 88% opaque on its own, so
              the dock stays fully readable even where BlurView can't blur (older Android,
              reduced-transparency). The blur is a bonus layer, not the thing readability
              depends on. */}
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: islandTint() }]} />
          <View style={styles.itemsRow}>
            {state.routes.map((route, index) => {
              const descriptor = descriptors[route.key];
              if (!descriptor) return null;
              const { options } = descriptor;
              const focused = state.index === index;
              const label = options.title ?? route.name;
              const Icon = ICON_BY_ROUTE[route.name] ?? Home;

              function onPress() {
                const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              }

              return (
                <Fragment key={route.key}>
                  <Pressable
                    accessibilityRole="tab"
                    accessibilityState={{ selected: focused }}
                    accessibilityLabel={label}
                    onPress={onPress}
                    hitSlop={8}
                    style={styles.item}
                  >
                    <Animated.View
                      layout={LinearTransition.duration(duration.quick).springify()}
                      style={[styles.itemInner, focused ? styles.itemInnerActive : null]}
                    >
                      <Icon size={20} color={focused ? "#FFFFFF" : island.inkDim} strokeWidth={2} />
                      {focused ? <Text style={styles.label}>{label}</Text> : null}
                    </Animated.View>
                  </Pressable>
                </Fragment>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  dockShadow: {
    borderRadius: radius.pill,
    ...shadow.islandDock,
  },
  dockClip: {
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  itemsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
  item: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  itemInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    borderRadius: radius.pill,
  },
  itemInnerActive: {
    backgroundColor: color.accent,
  },
  label: {
    fontFamily: resolveFontFamily(typeScale.body),
    fontSize: typeScale.body.fontSize,
    lineHeight: typeScale.body.lineHeight,
    color: island.ink,
    fontWeight: "500",
  },
});
