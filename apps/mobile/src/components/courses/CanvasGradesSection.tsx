import {
  decideCanvasGrade,
  listPendingGradeExtractionsForCourse,
  type CanvasGradeExtractionRow,
  type GradeItemRow,
} from "@collegeos/api";
import { color, space } from "@collegeos/design/native";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { textStyle } from "../../design/typography";
import { getMobileSupabaseClient } from "../../lib/supabase/client";
import { Button, Panel, Select } from "../ui";
import { useToast } from "../ui/ToastProvider";

/**
 * Staged Canvas grades for this course (migration 45). Renders nothing when the queue
 * is empty -- an integration a user hasn't connected must not leave a permanent empty
 * panel on every course. The Select defaults to the poll's name-match SUGGESTION; the
 * user's pick is the decision, and refusals (wrong scale, wrong course) come back
 * verbatim from the server because the 422 body IS the UX.
 */
export function CanvasGradesSection({
  userId,
  courseId,
  gradeItems,
  onChanged,
}: {
  userId: string;
  courseId: number;
  gradeItems: Pick<GradeItemRow, "id" | "name">[];
  onChanged: () => void;
}) {
  const toast = useToast();
  const [extractions, setExtractions] = useState<CanvasGradeExtractionRow[]>([]);
  const [pickById, setPickById] = useState<Record<number, number | null>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const result = await listPendingGradeExtractionsForCourse(getMobileSupabaseClient(), userId, courseId);
    if (result.ok) setExtractions(result.data);
  }, [userId, courseId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onDecide = useCallback(
    async (extraction: CanvasGradeExtractionRow, decision: "applied" | "rejected") => {
      setBusyId(extraction.id);
      setError(null);
      const gradeItemId = pickById[extraction.id] ?? extraction.suggested_grade_item_id ?? undefined;
      const result = await decideCanvasGrade(getMobileSupabaseClient(), {
        extractionId: extraction.id,
        decision,
        ...(decision === "applied" && gradeItemId != null ? { gradeItemId } : {}),
      });
      setBusyId(null);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.show(decision === "applied" ? "In the Ledger." : "Rejected.", "success");
      await refresh();
      onChanged();
    },
    [pickById, toast, refresh, onChanged],
  );

  if (extractions.length === 0) return null;

  return (
    <View style={{ gap: space[3] }}>
      <Text style={textStyle("label", color.inkMuted)}>
        Canvas grades — {extractions.length} staged
      </Text>
      {error != null ? <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text> : null}
      {extractions.map((extraction) => (
        <Panel key={extraction.id}>
          <Text style={textStyle("body", color.ink)}>{extraction.canvas_assignment_name}</Text>
          <Text style={[textStyle("bodyS", color.inkMuted), { marginTop: space[1] }]}>
            {Number(extraction.score)}
            {extraction.points_possible != null ? ` / ${Number(extraction.points_possible)}` : ""}
            {extraction.graded_at != null ? ` · graded ${new Date(extraction.graded_at).toLocaleDateString()}` : ""}
          </Text>
          <View style={{ marginTop: space[3] }}>
            <Select
              label="Ledger row"
              options={[
                { value: "", label: "Pick the Ledger row" },
                ...gradeItems.map((g) => ({ value: String(g.id), label: g.name })),
              ]}
              value={String(pickById[extraction.id] ?? extraction.suggested_grade_item_id ?? "")}
              onValueChange={(v) =>
                setPickById((prev) => ({ ...prev, [extraction.id]: v === "" ? null : Number(v) }))
              }
            />
          </View>
          <View style={{ flexDirection: "row", gap: space[3], marginTop: space[3] }}>
            <Button
              variant="secondary"
              onPress={() => void onDecide(extraction, "applied")}
              loading={busyId === extraction.id}
              disabled={busyId != null}
            >
              Apply
            </Button>
            <Button variant="ghost" onPress={() => void onDecide(extraction, "rejected")} disabled={busyId != null}>
              Reject
            </Button>
          </View>
        </Panel>
      ))}
    </View>
  );
}
