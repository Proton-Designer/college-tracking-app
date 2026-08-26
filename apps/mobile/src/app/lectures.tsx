import type { LectureTranscriptRow } from "@collegeos/api";
import { color, radius, space } from "@collegeos/design/native";
import * as DocumentPicker from "expo-document-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Aurora, Button, DatePicker, Panel } from "../components/ui";
import { textStyle } from "../design/typography";
import { deleteAudio, importLecture, loadLectures } from "../lib/lectureActions";
import { useAuthSession } from "../lib/useAuthSession";

const STATUS_LABEL: Record<string, string> = {
  processing: "Transcribing…",
  ready: "Ready",
  failed: "Failed",
};

/**
 * Lecture capture, import-only (LECTURE_CAPTURE_SPEC; the in-app recording probe FAILED
 * in Expo Go -- suspension at lock destroys the file -- so Voice Memos records, this
 * screen imports). Pick the file, name the lecture DATE (the source anchor -- the
 * file's mtime is when it was exported, not when the professor spoke), and Deepgram
 * answers by webhook. Audio is deletable once the transcript is ready; never before,
 * never automatically.
 */
export default function LecturesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session: authSession } = useAuthSession();
  const userId = authSession?.user.id ?? null;
  const { courseId: courseIdParam } = useLocalSearchParams<{ courseId: string }>();
  const courseId = Number(courseIdParam);

  const [lectures, setLectures] = useState<LectureTranscriptRow[]>([]);
  const [lectureDate, setLectureDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (userId == null || !Number.isFinite(courseId)) return;
    const result = await loadLectures(userId, courseId);
    if (result.ok) setLectures(result.data);
    else setError(result.error);
    setLoading(false);
  }, [userId, courseId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onImport = useCallback(async () => {
    if (userId == null || lectureDate == null) return;
    const picked = await DocumentPicker.getDocumentAsync({ type: "audio/*", copyToCacheDirectory: true });
    if (picked.canceled || picked.assets.length === 0) return;
    const asset = picked.assets[0]!;
    setBusy(true);
    setError(null);
    const result = await importLecture(userId, courseId, lectureDate, {
      uri: asset.uri,
      name: asset.name,
      ...(asset.mimeType != null ? { mimeType: asset.mimeType } : {}),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setLectureDate(null);
    await refresh();
  }, [userId, courseId, lectureDate, refresh]);

  const onDeleteAudio = useCallback(
    async (lecture: LectureTranscriptRow) => {
      if (userId == null) return;
      setError(null);
      const result = await deleteAudio(userId, lecture);
      if (!result.ok) setError(result.error);
      await refresh();
    },
    [userId, refresh],
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

        <Text style={textStyle("displayM", color.ink)}>Lectures</Text>
        <Text style={textStyle("bodyS", color.inkMuted)}>
          Record with Voice Memos (it survives a locked screen; this app in Expo Go does not),
          then import here. The transcript stays; the audio is yours to delete after.
        </Text>

        {error != null ? (
          <Panel>
            <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text>
          </Panel>
        ) : null}

        <Panel>
          <Text style={textStyle("label", color.inkMuted)}>Import a recording</Text>
          <View style={styles.spacedTop}>
            <DatePicker label="Lecture date" value={lectureDate} onValueChange={setLectureDate} />
          </View>
          <View style={styles.spacedTop}>
            <Button onPress={onImport} loading={busy} disabled={busy || lectureDate == null}>
              Pick audio file
            </Button>
          </View>
        </Panel>

        {loading ? (
          <Text style={textStyle("bodyS", color.inkMuted)}>Loading…</Text>
        ) : lectures.length === 0 ? (
          <Text style={textStyle("bodyS", color.inkMuted)}>No lectures imported yet.</Text>
        ) : (
          lectures.map((lecture) => (
            <Panel key={lecture.id}>
              <View style={styles.rowHeader}>
                <Text style={textStyle("body", color.ink)}>{lecture.lecture_date}</Text>
                <Text
                  style={textStyle(
                    "bodyS",
                    lecture.status === "failed" ? color.riskCritical : lecture.status === "ready" ? color.accent : color.inkMuted,
                  )}
                >
                  {STATUS_LABEL[lecture.status] ?? lecture.status}
                </Text>
              </View>

              {lecture.status === "failed" && lecture.failure_reason != null ? (
                <Text style={[textStyle("bodyS", color.riskCritical), styles.spacedTop]}>{lecture.failure_reason}</Text>
              ) : null}

              {lecture.status === "ready" && lecture.transcript != null ? (
                <>
                  <Pressable onPress={() => setExpandedId((prev) => (prev === lecture.id ? null : lecture.id))}>
                    <Text style={[textStyle("bodyS", color.ink), styles.spacedTop]} numberOfLines={expandedId === lecture.id ? undefined : 3}>
                      {lecture.transcript}
                    </Text>
                    <Text style={[textStyle("caption", color.inkFaint), styles.spacedTop]}>
                      {expandedId === lecture.id ? "Collapse" : "Tap to expand"}
                    </Text>
                  </Pressable>
                  <View style={[styles.spacedTop, styles.actionsRow]}>
                    <Button
                      variant="secondary"
                      onPress={() => router.push(`/bank?courseId=${courseId}&lectureId=${lecture.id}`)}
                    >
                      Draft questions
                    </Button>
                    {!lecture.audio_deleted ? (
                      <Button variant="ghost" onPress={() => void onDeleteAudio(lecture)}>
                        Delete audio
                      </Button>
                    ) : null}
                  </View>
                </>
              ) : null}
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
  rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderRadius: radius.sm },
  actionsRow: { flexDirection: "row", gap: space[3] },
});
