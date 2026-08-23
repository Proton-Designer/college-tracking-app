import { color, space } from "@collegeos/design/native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { GradeBoundaryRow } from "@collegeos/api";
import { Button, FieldError, Input, Modal } from "../ui";
import { useToast } from "../ui/ToastProvider";
import { textStyle } from "../../design/typography";
import { deleteGradeBoundaryAction, upsertGradeBoundaryAction } from "../../lib/courseActions";

/** Mirrors apps/web/src/components/courses/GradeBoundariesSection.tsx exactly -- same
 *  upsert-by-letter semantics, same inline "+ Add boundary" affordance. */
export function GradeBoundariesSection({
  userId,
  courseId,
  boundaries,
  onChanged,
}: {
  userId: string;
  courseId: number;
  boundaries: GradeBoundaryRow[];
  onChanged: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [letter, setLetter] = useState("");
  const [minPct, setMinPct] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  function openAdd() {
    setLetter("");
    setMinPct("");
    setError(undefined);
    setOpen(true);
  }

  function close() {
    if (isPending) return;
    setOpen(false);
  }

  async function handleSubmit() {
    const parsedMin = Number(minPct);
    if (!letter.trim() || minPct.trim() === "" || Number.isNaN(parsedMin) || parsedMin < 0 || parsedMin > 100) {
      setError("A letter and a minimum percent (0-100) are required.");
      return;
    }
    setError(undefined);
    setIsPending(true);
    const result = await upsertGradeBoundaryAction(userId, { courseId, letter: letter.trim(), minPct: parsedMin });
    setIsPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.show(`${letter.trim()} boundary saved.`, "success");
    setOpen(false);
    onChanged();
  }

  async function handleDelete(boundaryId: number) {
    setDeletingId(boundaryId);
    const result = await deleteGradeBoundaryAction(userId, boundaryId);
    setDeletingId(null);
    if (!result.ok) {
      toast.show(result.error ?? "Couldn't delete this boundary.", "error");
      return;
    }
    toast.show("Boundary deleted.", "success");
    onChanged();
  }

  return (
    <View style={{ gap: space[2] }}>
      <Text style={textStyle("label", color.inkMuted)}>Grade boundaries</Text>
      {boundaries.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[4] }}>
          {boundaries.map((b) => (
            <View key={b.id} style={{ flexDirection: "row", alignItems: "center", gap: space[1] }}>
              <Text style={textStyle("bodyS", color.ink)}>
                {b.letter} {Math.round(Number(b.min_pct))}%+
              </Text>
              <Pressable
                onPress={() => handleDelete(b.id)}
                disabled={deletingId === b.id}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${b.letter} boundary`}
                style={{ opacity: deletingId === b.id ? 0.4 : 1 }}
              >
                <Text style={textStyle("caption", color.inkFaint)}>×</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <Text style={textStyle("bodyS", color.ink)}>Not recorded</Text>
      )}
      <Pressable onPress={openAdd} accessibilityRole="button">
        <Text style={textStyle("caption", color.accent)}>+ Add boundary</Text>
      </Pressable>

      <Modal
        visible={open}
        onClose={close}
        title="Add a grade boundary"
        dismissable={!isPending}
        footer={
          <>
            <Button variant="ghost" onPress={close} disabled={isPending}>
              Cancel
            </Button>
            <Button onPress={handleSubmit} loading={isPending}>
              Save
            </Button>
          </>
        }
      >
        <View style={{ gap: space[4] }}>
          <Input label="Letter" required placeholder="e.g. A" value={letter} onChangeText={setLetter} />
          <Input label="Minimum percent" required keyboardType="numeric" value={minPct} onChangeText={setMinPct} />
          <Text style={textStyle("bodyS", color.inkMuted)}>Saving a letter that already exists on this course replaces its cutoff.</Text>
          {error ? <FieldError>{error}</FieldError> : null}
        </View>
      </Modal>
    </View>
  );
}
