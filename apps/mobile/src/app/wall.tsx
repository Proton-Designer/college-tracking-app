import { color, radius, space } from "@collegeos/design/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { WallCursor } from "@collegeos/api";
import { Aurora, Button, EmptyState, Panel } from "../components/ui";
import { textStyle } from "../design/typography";
import { loadWall, type WallDay } from "../lib/wallActions";
import { useAuthSession } from "../lib/useAuthSession";
import { useRefreshOnForeground } from "../lib/useRefreshOnForeground";

/**
 * The Wall -- BLUEPRINT Part IV-A. Every completed Hour as a permanent tile.
 *
 * The blueprint's rule for this surface is that it only ever grows and must never read as
 * debt: "opening the app should always feel like looking at evidence." So there is no
 * missed-day row, no gap marker, and no abandoned Hour here. Those are real and recorded
 * elsewhere -- an abandoned session keeps its real elapsed time and still feeds the
 * calibration engine -- they are simply not proof of a finished Hour, which is the only
 * claim this screen makes.
 *
 * This is also the surface D23 leaves standing in place of a chain: proof that accumulates,
 * with no streak to break.
 */
export default function WallScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session: authSession } = useAuthSession();
  const userId = authSession?.user.id ?? null;

  const [days, setDays] = useState<WallDay[]>([]);
  const [nextCursor, setNextCursor] = useState<WallCursor | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Every load carries a token; a response only applies if it's still the most recent one
  // in flight. Without this, a foreground/pull refresh racing an in-progress "Show older
  // Hours" fetch can have the load-more response land after the refresh's page-one reset
  // and re-merge stale older tiles onto it -- exactly the duplicate/orphan the refresh was
  // supposed to prevent.
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    if (userId == null) return;
    setRefreshing(true);
    const requestId = ++requestIdRef.current;
    const result = await loadWall(userId);
    setRefreshing(false);
    if (requestIdRef.current !== requestId) return;
    if (result.ok) {
      setDays(result.data.days);
      setNextCursor(result.data.nextCursor);
      setTotalCount(result.data.totalCount);
    } else setError(result.error);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useRefreshOnForeground(refresh);

  const onLoadMore = useCallback(async () => {
    if (userId == null || nextCursor == null) return;
    setLoadingMore(true);
    const requestId = ++requestIdRef.current;
    const result = await loadWall(userId, nextCursor);
    const stillCurrent = requestIdRef.current === requestId;
    setLoadingMore(false);
    if (!stillCurrent) return;
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // Merge: the new page's first day may continue the loaded list's last day.
    setDays((prev) => {
      const merged = [...prev];
      for (const day of result.data.days) {
        const last = merged[merged.length - 1];
        if (last != null && last.localDate === day.localDate) {
          merged[merged.length - 1] = { ...last, tiles: [...last.tiles, ...day.tiles] };
        } else merged.push(day);
      }
      return merged;
    });
    setNextCursor(result.data.nextCursor);
  }, [userId, nextCursor]);

  const totalHours = totalCount ?? days.reduce((sum, d) => sum + d.tiles.length, 0);

  return (
    <View style={styles.screen}>
      <Aurora band={null} />
      <ScrollView
        testID="wall-scroll"
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space[6], paddingBottom: insets.bottom + space[8] },
        ]}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} />}
      >
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text style={textStyle("bodyS", color.inkMuted)}>← Back</Text>
        </Pressable>

        <Text style={textStyle("displayM", color.ink)}>The Wall</Text>
        <Text style={textStyle("label", color.inkMuted)}>
          {totalHours} Hour{totalHours === 1 ? "" : "s"} completed, all time
        </Text>

        {error != null ? (
          <Panel>
            <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text>
          </Panel>
        ) : null}

        {loading ? (
          <Text style={textStyle("bodyS", color.inkMuted)}>Loading…</Text>
        ) : days.length === 0 ? (
          <EmptyState
            title="Nothing on the wall yet"
            description="Every Hour you finish lands here and stays."
          />
        ) : (
          <>
            {days.map((day) => (
              <View key={day.localDate} style={styles.dayBlock}>
                <Text style={textStyle("label", color.inkMuted)}>{day.localDate}</Text>
                <View style={styles.grid}>
                  {day.tiles.map((tile) => (
                    <View key={tile.id} style={styles.tile}>
                      <Text style={textStyle("label", color.inkMuted)}>Hour {tile.hourIndex}</Text>
                      <Text style={[textStyle("body", color.ink), styles.tileTitle]} numberOfLines={3}>
                        {tile.deliverable ?? "—"}
                      </Text>
                      <Text style={textStyle("bodyS", color.inkMuted)}>
                        {tile.minutes}m · {tile.interruptions} distraction
                        {tile.interruptions === 1 ? "" : "s"}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
            {nextCursor != null ? (
              <Button
                variant="secondary"
                onPress={() => void onLoadMore()}
                loading={loadingMore}
                disabled={loadingMore || refreshing}
              >
                Show older Hours
              </Button>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  content: { paddingHorizontal: space[5], gap: space[4] },
  dayBlock: { gap: space[2] },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space[3] },
  tile: {
    flexBasis: "47%",
    flexGrow: 1,
    borderWidth: 1,
    borderColor: color.hairline,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    padding: space[3],
    gap: space[1],
  },
  tileTitle: { marginVertical: space[1] },
});
