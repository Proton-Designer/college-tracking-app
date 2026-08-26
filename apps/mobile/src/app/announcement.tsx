import type { AnnouncementChange, AnnouncementDiff } from "@collegeos/api";
import { color, radius, space } from "@collegeos/design/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Aurora, Button, DatePicker, Panel, Select, Textarea } from "../components/ui";
import { textStyle } from "../design/typography";
import {
  confirmAnnouncementAction,
  loadAnnouncementDiff,
  loadCourseDeliverableTitles,
  parseAnnouncementAction,
} from "../lib/announcementActions";
import { useAuthSession } from "../lib/useAuthSession";

type Phase =
  | { step: "compose" }
  | { step: "parsing" }
  | { step: "filed" }
  | { step: "review"; announcementId: number; changes: AnnouncementChange[]; edited: boolean }
  | { step: "applied"; summary: string };

/**
 * The announcement paste flow -- BLUEPRINT 5.2, the share-sheet's paste fallback (the
 * share sheet itself is a dev-build item). One gesture: paste, parse, review the diff,
 * confirm. The same confirmation grammar as the syllabus flow by ruling: the server
 * holds the only write path, and everything here is proposal and review.
 *
 * Editing is inline on the diff rows: an unresolved date gets a DatePicker (the server
 * refuses to apply a null date, so resolving it here is the ONLY way forward -- never a
 * server-side guess), and a date_change's matched title is a Select over the course's
 * real deliverables, because a mismatched title is the one failure the parser can't see.
 */
export default function AnnouncementScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session: authSession } = useAuthSession();
  const userId = authSession?.user.id ?? null;
  const { courseId: courseIdParam, announcementId: announcementIdParam } = useLocalSearchParams<{
    courseId: string;
    announcementId?: string;
  }>();
  const courseId = Number(courseIdParam);
  // A staged announcement (polled from Canvas, or abandoned mid-review) opens straight
  // in review -- same screen, same confirmation grammar, no paste step.
  const stagedAnnouncementId = announcementIdParam != null ? Number(announcementIdParam) : null;

  const [phase, setPhase] = useState<Phase>({ step: "compose" });
  const [rawText, setRawText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [titles, setTitles] = useState<string[]>([]);

  useEffect(() => {
    if (userId == null || !Number.isFinite(courseId)) return;
    void loadCourseDeliverableTitles(userId, courseId).then((r) => {
      if (r.ok) setTitles(r.data);
    });
  }, [userId, courseId]);

  useEffect(() => {
    if (userId == null || stagedAnnouncementId == null || !Number.isFinite(stagedAnnouncementId)) return;
    void loadAnnouncementDiff(userId, stagedAnnouncementId).then((diff) => {
      if (!diff.ok) {
        setError(diff.error);
        return;
      }
      setPhase({ step: "review", announcementId: stagedAnnouncementId, changes: diff.data, edited: false });
    });
  }, [userId, stagedAnnouncementId]);

  const onParse = useCallback(async () => {
    if (userId == null) return;
    setError(null);
    setPhase({ step: "parsing" });
    const result = await parseAnnouncementAction(userId, courseId, rawText);
    if (!result.ok) {
      setError(result.error);
      setPhase({ step: "compose" });
      return;
    }
    if (result.data.kind === "noSchedulableContent") {
      setPhase({ step: "filed" });
      return;
    }
    const diff = await loadAnnouncementDiff(userId, result.data.announcementId);
    if (!diff.ok) {
      setError(diff.error);
      setPhase({ step: "compose" });
      return;
    }
    setPhase({ step: "review", announcementId: result.data.announcementId, changes: diff.data, edited: false });
  }, [userId, courseId, rawText]);

  const patchChange = useCallback((index: number, patch: Partial<AnnouncementChange>) => {
    setPhase((prev) => {
      if (prev.step !== "review") return prev;
      const changes = prev.changes.map((c, i) => (i === index ? ({ ...c, ...patch } as AnnouncementChange) : c));
      return { ...prev, changes, edited: true };
    });
  }, []);

  const onDecision = useCallback(
    async (decision: "confirm" | "reject") => {
      if (userId == null || phase.step !== "review") return;
      setError(null);
      const diff: AnnouncementDiff = { changes: phase.changes };
      const result = await confirmAnnouncementAction(userId, {
        announcementId: phase.announcementId,
        decision: decision === "reject" ? "rejected" : phase.edited ? "edited" : "confirmed",
        ...(decision === "confirm" && phase.edited ? { editedDiff: diff } : {}),
      });
      if (!result.ok) {
        // A 422 names exactly what to fix (an unresolved date, an unmatched title);
        // surfacing it verbatim IS the UX -- the review stays open for the edit.
        setError(result.error);
        return;
      }
      if (decision === "reject") {
        router.back();
        return;
      }
      const a = result.data.applied;
      setPhase({
        step: "applied",
        summary:
          a != null
            ? `${a.dateChanges} date change${a.dateChanges === 1 ? "" : "s"}, ${a.newItems} new item${a.newItems === 1 ? "" : "s"}, ${a.notes} note${a.notes === 1 ? "" : "s"}.`
            : "Applied.",
      });
    },
    [userId, phase, router],
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

        <Text style={textStyle("displayM", color.ink)}>Announcement</Text>

        {error != null ? (
          <Panel>
            <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text>
          </Panel>
        ) : null}

        {phase.step === "compose" || phase.step === "parsing" ? (
          <Panel>
            <Text style={textStyle("bodyS", color.inkMuted)}>
              Paste what the professor posted. You&apos;ll review every change before
              anything moves.
            </Text>
            <View style={styles.spacedTop}>
              <Textarea
                label="Announcement"
                value={rawText}
                onChangeText={setRawText}
                placeholder="Quiz 4 is moved to Oct 10…"
                editable={phase.step !== "parsing"}
              />
            </View>
            <View style={styles.spacedTop}>
              <Button
                onPress={onParse}
                disabled={phase.step === "parsing" || rawText.trim().length === 0}
                loading={phase.step === "parsing"}
              >
                {phase.step === "parsing" ? "Reading…" : "Parse it"}
              </Button>
            </View>
          </Panel>
        ) : null}

        {phase.step === "filed" ? (
          <Panel>
            <Text style={textStyle("bodyL", color.ink)}>Nothing schedulable</Text>
            <Text style={[textStyle("bodyS", color.inkMuted), styles.spacedTop]}>
              Filed to the course. No dates moved, nothing to confirm.
            </Text>
            <View style={styles.spacedTop}>
              <Button variant="secondary" onPress={() => router.back()}>
                Done
              </Button>
            </View>
          </Panel>
        ) : null}

        {phase.step === "review" ? (
          <>
            <Text style={textStyle("label", color.inkMuted)}>
              Proposed changes — nothing applies until you confirm
            </Text>
            {phase.changes.map((change, index) => (
              <Panel key={index}>
                {change.kind === "date_change" ? (
                  <>
                    <Text style={textStyle("label", color.inkMuted)}>Date change</Text>
                    <View style={styles.spacedTop}>
                      <Select
                        label="Item"
                        options={titles.map((t) => ({ value: t, label: t }))}
                        value={change.matchedTitle}
                        onValueChange={(v) => patchChange(index, { matchedTitle: v })}
                      />
                    </View>
                    <View style={styles.spacedTop}>
                      <DatePicker
                        label={change.newDueDate == null ? `New date — unresolved: "${change.newDueText ?? "?"}"` : "New date"}
                        value={change.newDueDate}
                        onValueChange={(v) => patchChange(index, { newDueDate: v })}
                        {...(change.newDueDate == null ? { error: "Pick a real date; the server won't guess." } : {})}
                      />
                    </View>
                  </>
                ) : change.kind === "new_item" ? (
                  <>
                    <Text style={textStyle("label", color.inkMuted)}>
                      New {change.itemType.replace("_", " ")}
                    </Text>
                    <Text style={[textStyle("bodyL", color.ink), styles.spacedTop]}>{change.title}</Text>
                    <View style={styles.spacedTop}>
                      <DatePicker
                        label={change.dueDate == null ? `Due — unresolved: "${change.dueText ?? "?"}"` : "Due"}
                        value={change.dueDate}
                        onValueChange={(v) => patchChange(index, { dueDate: v })}
                        {...(change.dueDate == null ? { error: "Pick a real date; the server won't guess." } : {})}
                      />
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={textStyle("label", color.inkMuted)}>Note — no schedule change</Text>
                    <Text style={[textStyle("body", color.ink), styles.spacedTop]}>{change.text}</Text>
                  </>
                )}
                <Text style={[textStyle("caption", color.inkFaint), styles.snippet]}>
                  “{change.sourceSnippet}”
                </Text>
              </Panel>
            ))}
            <Button onPress={() => void onDecision("confirm")}>
              {phase.edited ? "Apply edited changes" : "Apply changes"}
            </Button>
            <Button variant="secondary" onPress={() => void onDecision("reject")}>
              Reject
            </Button>
          </>
        ) : null}

        {phase.step === "applied" ? (
          <Panel>
            <Text style={textStyle("bodyL", color.ink)}>Applied</Text>
            <Text style={[textStyle("bodyS", color.inkMuted), styles.spacedTop]}>{phase.summary}</Text>
            <View style={styles.spacedTop}>
              <Button variant="secondary" onPress={() => router.back()}>
                Done
              </Button>
            </View>
          </Panel>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  content: { paddingHorizontal: space[5], gap: space[4] },
  spacedTop: { marginTop: space[2] },
  snippet: {
    marginTop: space[3],
    borderLeftWidth: 2,
    borderLeftColor: color.hairline,
    paddingLeft: space[3],
    borderRadius: radius.sm,
  },
});
