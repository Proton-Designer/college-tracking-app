import { color, radius, space } from "@collegeos/design/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { listCourses, type ReviewableAnnouncement } from "@collegeos/api";
import { Aurora, Button, Panel } from "../components/ui";
import { textStyle } from "../design/typography";
import { loadReviewableAnnouncements, reparseAnnouncementAction } from "../lib/canvasActions";
import { getMobileSupabaseClient } from "../lib/supabase/client";
import { useAuthSession } from "../lib/useAuthSession";

/**
 * The announcement worklist -- everything staged (polled from Canvas or pasted and
 * abandoned mid-review) that still needs a human. A 'parsed' row opens the SAME review
 * screen the paste flow uses; 'pending'/'failed' rows offer a re-parse. This is the
 * surface that keeps the poll honest: staged work is visible work, never a silent queue
 * (the S5 lesson -- nothing the system defers may be silent).
 */
export default function AnnouncementsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session: authSession } = useAuthSession();
  const userId = authSession?.user.id ?? null;

  const [items, setItems] = useState<ReviewableAnnouncement[]>([]);
  const [courseCodeById, setCourseCodeById] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (userId == null) return;
    const [result, coursesResult] = await Promise.all([
      loadReviewableAnnouncements(userId),
      listCourses(getMobileSupabaseClient(), { includeArchived: true }),
    ]);
    if (result.ok) setItems(result.data);
    else setError(result.error);
    if (coursesResult.ok) {
      setCourseCodeById(Object.fromEntries(coursesResult.data.map((c) => [c.id, c.code])));
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onReparse = useCallback(
    async (item: ReviewableAnnouncement) => {
      setBusyId(item.id);
      setError(null);
      const result = await reparseAnnouncementAction(item.id);
      setBusyId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.data.kind === "parsed") {
        router.push(`/announcement?announcementId=${item.id}&courseId=${item.courseId}`);
        return;
      }
      await refresh(); // filed as no-schedulable-content -- drops off the worklist
    },
    [router, refresh],
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

        <Text style={textStyle("displayM", color.ink)}>Announcements</Text>
        <Text style={textStyle("bodyS", color.inkMuted)}>
          Staged, not applied — every change still goes through your confirmation.
        </Text>

        {error != null ? (
          <Panel>
            <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text>
          </Panel>
        ) : null}

        {loading ? (
          <Text style={textStyle("bodyS", color.inkMuted)}>Loading…</Text>
        ) : items.length === 0 ? (
          <Panel>
            <Text style={textStyle("bodyL", color.ink)}>Nothing waiting</Text>
            <Text style={[textStyle("bodyS", color.inkMuted), styles.spacedTop]}>
              New Canvas announcements land here after each poll.
            </Text>
          </Panel>
        ) : (
          items.map((item) => (
            <Panel key={item.id}>
              <Text style={textStyle("label", color.inkMuted)}>
                {courseCodeById[item.courseId] ?? `Course #${item.courseId}`}
                {item.source === "canvas" ? " · Canvas" : " · pasted"} ·{" "}
                {new Date(item.createdAt).toLocaleDateString()}
              </Text>
              <Text style={[textStyle("body", color.ink), styles.spacedTop]} numberOfLines={4}>
                {item.rawText}
              </Text>
              {item.status === "failed" && item.failureReason != null ? (
                <Text style={[textStyle("bodyS", color.riskCritical), styles.spacedTop]}>
                  Parse failed: {item.failureReason}
                </Text>
              ) : null}
              <View style={[styles.spacedTop, styles.actions]}>
                {item.status === "parsed" ? (
                  <Button
                    onPress={() => router.push(`/announcement?announcementId=${item.id}&courseId=${item.courseId}`)}
                  >
                    Review changes
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    onPress={() => void onReparse(item)}
                    loading={busyId === item.id}
                    disabled={busyId != null}
                  >
                    {item.status === "failed" ? "Retry parse" : "Parse now"}
                  </Button>
                )}
              </View>
            </Panel>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  content: { paddingHorizontal: space[5], gap: space[4] },
  spacedTop: { marginTop: space[2] },
  actions: { flexDirection: "row", gap: space[3], borderRadius: radius.md },
});
