import { getOwnProfile, updateOwnProfile } from "@collegeos/api";
import { DEFAULT_BASELINE_HOURS } from "@collegeos/core";
import { color, radius, space } from "@collegeos/design/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Aurora, Panel } from "../components/ui";
import { textStyle } from "../design/typography";
import { getMobileSupabaseClient } from "../lib/supabase/client";
import { useAuthSession } from "../lib/useAuthSession";

const WEEKDAYS: { iso: number; label: string }[] = [
  { iso: 1, label: "Monday" },
  { iso: 2, label: "Tuesday" },
  { iso: 3, label: "Wednesday" },
  { iso: 4, label: "Thursday" },
  { iso: 5, label: "Friday" },
  { iso: 6, label: "Saturday" },
  { iso: 7, label: "Sunday" },
];

const MAX_BASELINE = 12;

/**
 * Per-weekday baselines -- BLUEPRINT Part II item 5: "four hours is the baseline forever"
 * only works if it fits the real schedule, so class-heavy days get a lower bar and Day Won
 * stays honest. Zero is a legal value (a deliberate rest day), which is why the stepper
 * bottoms at 0 rather than 1.
 *
 * Edits apply to days created FROM NOW ON: an existing day keeps the snapshot it inherited
 * (migration 38's rule), so changing Tuesday's standard tonight never rewrites whether
 * last Tuesday was Won. The copy under the list says so.
 */
export default function BaselinesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session: authSession } = useAuthSession();
  const userId = authSession?.user.id ?? null;

  const [map, setMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userId == null) return;
    void getOwnProfile(getMobileSupabaseClient()).then((result) => {
      if (result.ok) {
        const raw = result.data.weekday_baselines as Record<string, unknown> | null;
        const clean: Record<string, number> = {};
        for (const { iso } of WEEKDAYS) {
          const v = raw?.[String(iso)];
          if (typeof v === "number" && Number.isInteger(v) && v >= 0) clean[String(iso)] = v;
        }
        setMap(clean);
      } else {
        setError(result.error.message);
      }
      setLoading(false);
    });
  }, [userId]);

  const setBaseline = useCallback(
    async (iso: number, value: number) => {
      const clamped = Math.max(0, Math.min(MAX_BASELINE, value));
      const next = { ...map, [String(iso)]: clamped };
      // Optimistic, with rollback -- same convention as the routine checklist.
      const previous = map;
      setMap(next);
      if (userId == null) return;
      const result = await updateOwnProfile(getMobileSupabaseClient(), userId, { weekday_baselines: next });
      if (!result.ok) {
        setMap(previous);
        setError(result.error.message);
      }
    },
    [map, userId],
  );

  return (
    <View style={styles.screen}>
      <Aurora band={null} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space[6], paddingBottom: insets.bottom + space[8] },
        ]}
      >
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text style={textStyle("bodyS", color.inkMuted)}>← Back</Text>
        </Pressable>

        <Text style={textStyle("displayM", color.ink)}>Baselines</Text>
        <Text style={textStyle("bodyS", color.inkMuted)}>
          Hours each weekday needs for Day Won. Fit it to your real schedule — an honest 2
          beats a fictional 4.
        </Text>

        {error != null ? (
          <Panel>
            <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text>
          </Panel>
        ) : null}

        {loading ? (
          <Text style={textStyle("bodyS", color.inkMuted)}>Loading…</Text>
        ) : (
          <Panel>
            {WEEKDAYS.map(({ iso, label }) => {
              const value = map[String(iso)] ?? DEFAULT_BASELINE_HOURS;
              return (
                <View key={iso} style={styles.row}>
                  <Text style={[textStyle("body", color.ink), styles.rowLabel]}>{label}</Text>
                  <View style={styles.stepper}>
                    <Pressable
                      onPress={() => void setBaseline(iso, value - 1)}
                      accessibilityRole="button"
                      accessibilityLabel={`Lower ${label} baseline`}
                      hitSlop={8}
                      style={styles.stepBtn}
                    >
                      <Text style={textStyle("bodyL", color.ink)}>−</Text>
                    </Pressable>
                    <Text style={[textStyle("bodyL", color.ink), styles.stepValue]}>{value}</Text>
                    <Pressable
                      onPress={() => void setBaseline(iso, value + 1)}
                      accessibilityRole="button"
                      accessibilityLabel={`Raise ${label} baseline`}
                      hitSlop={8}
                      style={styles.stepBtn}
                    >
                      <Text style={textStyle("bodyL", color.ink)}>+</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
            <Text style={[textStyle("bodyS", color.inkMuted), styles.footnote]}>
              Applies to days from now on. A day already started keeps the standard it was
              given — changing tonight never rewrites whether last Tuesday was won.
            </Text>
          </Panel>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  content: { paddingHorizontal: space[5], gap: space[4] },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space[2],
  },
  rowLabel: { flex: 1 },
  stepper: { flexDirection: "row", alignItems: "center", gap: space[3] },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stepValue: { minWidth: 24, textAlign: "center", fontVariant: ["tabular-nums"] },
  footnote: { marginTop: space[3] },
});
