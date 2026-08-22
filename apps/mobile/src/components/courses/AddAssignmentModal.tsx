import { space } from "@collegeos/design/native";
import { useState } from "react";
import { View } from "react-native";
import type { DeliverableType } from "@collegeos/api";
import { Button, DatePicker, FieldError, Input, Modal, Select } from "../ui";
import { useToast } from "../ui/ToastProvider";
import { createDeliverableAction } from "../../lib/courseActions";

const TYPE_OPTIONS: { value: DeliverableType; label: string }[] = [
  { value: "problem_set", label: "Problem set" },
  { value: "paper", label: "Paper" },
  { value: "report", label: "Report" },
  { value: "exam", label: "Exam" },
  { value: "project", label: "Project" },
  { value: "reading", label: "Reading" },
];

/** Mirrors apps/web/src/components/courses/AddAssignmentModal.tsx exactly, including
 *  DatePicker's null-stays-null contract -- no today-by-default. */
export function AddAssignmentModal({ userId, courseId, onAdded }: { userId: string; courseId: number; onAdded: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  function reset() {
    setTitle("");
    setType(null);
    setDueDate(null);
    setEstimatedMinutes("");
    setError(undefined);
  }

  function close() {
    if (isPending) return;
    setOpen(false);
    reset();
  }

  async function handleSubmit() {
    if (!title.trim() || !type || !dueDate) {
      setError("Title, type, and due date are all required.");
      return;
    }
    const parsedMinutes = estimatedMinutes.trim() === "" ? undefined : Number(estimatedMinutes);
    if (parsedMinutes != null && (Number.isNaN(parsedMinutes) || parsedMinutes <= 0)) {
      setError("Estimated minutes must be a positive number, if given at all.");
      return;
    }
    setError(undefined);
    setIsPending(true);
    const result = await createDeliverableAction(userId, {
      courseId,
      title: title.trim(),
      type: type as DeliverableType,
      dueDate,
      ...(parsedMinutes != null ? { estimatedMinutes: parsedMinutes } : {}),
    });
    setIsPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.show(`${title.trim()} added.`, "success");
    setOpen(false);
    reset();
    onAdded();
  }

  return (
    <>
      <Button variant="secondary" onPress={() => setOpen(true)}>
        Add assignment
      </Button>
      <Modal
        visible={open}
        onClose={close}
        title="Add an assignment"
        dismissable={!isPending}
        footer={
          <>
            <Button variant="ghost" onPress={close} disabled={isPending}>
              Cancel
            </Button>
            <Button onPress={handleSubmit} loading={isPending}>
              Add assignment
            </Button>
          </>
        }
      >
        <View style={{ gap: space[4] }}>
          <Input label="Title" required placeholder="e.g. Homework 5" value={title} onChangeText={setTitle} />
          <Select label="Type" required options={TYPE_OPTIONS} value={type} onValueChange={setType} />
          <DatePicker label="Due date" required value={dueDate} onValueChange={setDueDate} />
          <Input
            label="Estimated minutes (optional)"
            keyboardType="numeric"
            placeholder="Leave blank if unknown"
            value={estimatedMinutes}
            onChangeText={setEstimatedMinutes}
          />
          {error ? <FieldError>{error}</FieldError> : null}
        </View>
      </Modal>
    </>
  );
}
