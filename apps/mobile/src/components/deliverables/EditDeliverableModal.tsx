import { space } from "@collegeos/design/native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import type { Deliverable, DeliverableType } from "@collegeos/api";
import { Button, DatePicker, FieldError, Input, Modal, Select } from "../ui";
import { useToast } from "../ui/ToastProvider";
import { deleteDeliverableAction, updateDeliverableAction } from "../../lib/deliverableActions";

const TYPE_OPTIONS: { value: DeliverableType; label: string }[] = [
  { value: "problem_set", label: "Problem set" },
  { value: "paper", label: "Paper" },
  { value: "report", label: "Report" },
  { value: "exam", label: "Exam" },
  { value: "project", label: "Project" },
  { value: "reading", label: "Reading" },
  { value: "quiz", label: "Quiz" },
  { value: "post", label: "Discussion post" },
  { value: "admin", label: "Admin" },
];

const STATUS_OPTIONS = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
];

/** Mirrors apps/web/src/components/deliverables/EditDeliverableModal.tsx exactly. Web's
 *  deleteDeliverableAction redirects server-side; there's no server-action layer here, so
 *  this navigates client-side via expo-router on a successful delete instead. */
export function EditDeliverableModal({ userId, deliverable, onSaved }: { userId: string; deliverable: Deliverable; onSaved: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(deliverable.title);
  const [type, setType] = useState<string | null>(deliverable.type);
  const [dueDate, setDueDate] = useState<string | null>(deliverable.local_due_date);
  const [estimatedMinutes, setEstimatedMinutes] = useState(deliverable.estimated_minutes != null ? String(deliverable.estimated_minutes) : "");
  const [status, setStatus] = useState<string | null>(deliverable.status);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  function close() {
    if (isPending) return;
    setOpen(false);
  }

  async function handleSubmit() {
    if (!title.trim() || !type || !dueDate) {
      setError("Title, type, and due date are all required.");
      return;
    }
    const parsedMinutes = estimatedMinutes.trim() === "" ? null : Number(estimatedMinutes);
    if (parsedMinutes != null && (Number.isNaN(parsedMinutes) || parsedMinutes <= 0)) {
      setError("Estimated minutes must be a positive number, if given at all.");
      return;
    }
    setError(undefined);
    setIsPending(true);
    const result = await updateDeliverableAction(userId, deliverable.id, {
      title: title.trim(),
      type: type as DeliverableType,
      dueDate,
      estimatedMinutes: parsedMinutes,
      status: (status ?? deliverable.status) as Deliverable["status"],
    });
    setIsPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.show("Assignment updated.", "success");
    setOpen(false);
    onSaved();
  }

  async function handleDelete() {
    setIsPending(true);
    const result = await deleteDeliverableAction(userId, deliverable.id);
    setIsPending(false);
    if (!result.ok) {
      toast.show(result.error ?? "Couldn't delete this assignment.", "error");
      return;
    }
    setOpen(false);
    router.replace(`/courses/${deliverable.course_id}`);
  }

  return (
    <>
      <Button variant="secondary" onPress={() => setOpen(true)}>
        Edit
      </Button>
      <Modal
        visible={open}
        onClose={close}
        title="Edit assignment"
        dismissable={!isPending}
        footer={
          <View style={{ flex: 1, flexDirection: "row", justifyContent: "space-between", gap: space[3] }}>
            <Button variant="destructive" onPress={handleDelete} loading={isPending}>
              Delete
            </Button>
            <View style={{ flexDirection: "row", gap: space[3] }}>
              <Button variant="ghost" onPress={close} disabled={isPending}>
                Cancel
              </Button>
              <Button onPress={handleSubmit} loading={isPending}>
                Save
              </Button>
            </View>
          </View>
        }
      >
        <View style={{ gap: space[4] }}>
          <Input label="Title" required value={title} onChangeText={setTitle} />
          <Select label="Type" required options={TYPE_OPTIONS} value={type} onValueChange={setType} />
          <DatePicker label="Due date" required value={dueDate} onValueChange={setDueDate} />
          <Input label="Estimated minutes" keyboardType="numeric" value={estimatedMinutes} onChangeText={setEstimatedMinutes} />
          <Select label="Status" options={STATUS_OPTIONS} value={status} onValueChange={setStatus} />
          {error ? <FieldError>{error}</FieldError> : null}
        </View>
      </Modal>
    </>
  );
}
