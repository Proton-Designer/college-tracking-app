import { listAnnouncementsForCourse, type AnnouncementRow } from "@collegeos/api";
import { color, space } from "@collegeos/design/native";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";
import { getMobileSupabaseClient } from "../../lib/supabase/client";
import { Panel } from "../ui";

const STATUS_LABEL: Record<string, string> = {
  applied: "Applied",
  no_schedulable_content: "Filed — nothing schedulable",
  rejected: "Rejected",
  parsed: "Awaiting review",
  pending: "Not parsed yet",
  failed: "Parse failed",
};

/**
 * The per-course announcement record -- BLUEPRINT 5.2's "filed to the course", finally
 * readable (the recorded gap: the worklist showed pending only, and a filed
 * announcement vanished). Collapsed by default: history is reference, not a feed.
 */
export function AnnouncementHistorySection({ userId, courseId }: { userId: string; courseId: number }) {
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void listAnnouncementsForCourse(getMobileSupabaseClient(), userId, courseId).then((r) => {
      if (r.ok) setAnnouncements(r.data);
    });
  }, [userId, courseId]);

  if (announcements.length === 0) return null;

  return (
    <View style={{ gap: space[3] }}>
      <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button">
        <Text style={textStyle("label", color.inkMuted)}>
          Announcements — {announcements.length} on record {open ? "▾" : "▸"}
        </Text>
      </Pressable>
      {open
        ? announcements.map((a) => (
            <Panel key={a.id}>
              <View style={styles.rowHeader}>
                <Text style={textStyle("caption", color.inkFaint)}>
                  {new Date(a.created_at).toLocaleDateString()}
                  {a.source === "canvas" ? " · Canvas" : " · pasted"}
                </Text>
                <Text
                  style={textStyle("caption", a.status === "failed" ? color.riskCritical : color.inkMuted)}
                >
                  {STATUS_LABEL[a.status] ?? a.status}
                </Text>
              </View>
              <Text style={[textStyle("bodyS", color.ink), styles.spacedTop]} numberOfLines={3}>
                {a.raw_text}
              </Text>
            </Panel>
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  spacedTop: { marginTop: space[2] },
  rowHeader: { flexDirection: "row", justifyContent: "space-between" },
});
