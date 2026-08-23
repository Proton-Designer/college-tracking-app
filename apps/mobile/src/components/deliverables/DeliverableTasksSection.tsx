import { color, space } from "@collegeos/design/native";
import { useState } from "react";
import { Text, View } from "react-native";
import type { Task, TaskProofOfWorkType } from "@collegeos/api";
import { Button, DatePicker, FieldError, Input, Modal, Panel, Select, Toggle } from "../ui";
import { useToast } from "../ui/ToastProvider";
import { textStyle } from "../../design/typography";
import { addDeliverableTaskAction, setTaskProofOfWorkAction } from "../../lib/deliverableActions";

/** J2: a raw enum value ("in_progress") leaking straight into UI text reads as unfinished --
 *  sentence case matches how every other label in this app is written. */
function statusLabel(status: string): string {
  const spaced = status.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const PROOF_TYPE_OPTIONS: { value: TaskProofOfWorkType; label: string }[] = [
  { value: "confirmation_attachment", label: "Attachment" },
  { value: "practice_question_count", label: "Practice question count" },
  { value: "git_commit", label: "Git commit" },
  { value: "summary_text", label: "Written summary" },
  { value: "whoop_workout", label: "WHOOP workout" },
];

function TaskRow({ userId, task, isLast }: { userId: string; task: Task; isLast: boolean }) {
  const toast = useToast();
  const [requiresProof, setRequiresProof] = useState(task.requires_proof_of_work);
  const [proofType, setProofType] = useState<string | null>(task.proof_of_work_type);
  const [isPending, setIsPending] = useState(false);

  async function save(nextRequires: boolean, nextType: string | null) {
    if (nextRequires && !nextType) return; // wait for a type before saving
    setIsPending(true);
    const result = await setTaskProofOfWorkAction(userId, {
      taskId: task.id,
      requiresProofOfWork: nextRequires,
      proofOfWorkType: nextRequires ? (nextType as TaskProofOfWorkType) : null,
    });
    setIsPending(false);
    if (!result.ok) {
      toast.show(result.error ?? "Couldn't update this task.", "error");
    }
  }

  function handleToggle(checked: boolean) {
    setRequiresProof(checked);
    if (!checked) {
      setProofType(null);
      save(false, null);
    } else if (proofType) {
      save(true, proofType);
    }
    // If checked and no type chosen yet, wait for the Select below before saving.
  }

  function handleTypeChange(value: string) {
    setProofType(value);
    save(true, value);
  }

  return (
    <View style={{ gap: space[2], paddingBottom: isLast ? 0 : space[3], borderBottomWidth: isLast ? 0 : 1, borderBottomColor: color.hairline }}>
      <View>
        <Text style={textStyle("bodyS", color.ink)}>{task.title}</Text>
        <Text style={textStyle("caption", color.inkFaint)}>
          {task.planned_date} · {statusLabel(task.status)}
        </Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
        <Toggle checked={requiresProof} onValueChange={handleToggle} label="Requires proof of work" disabled={isPending} />
      </View>
      {requiresProof ? (
        <Select options={PROOF_TYPE_OPTIONS} value={proofType} onValueChange={handleTypeChange} placeholder="Proof type…" disabled={isPending} />
      ) : null}
    </View>
  );
}

function AddTaskModal({
  userId,
  deliverableId,
  courseId,
  defaultDate,
  onAdded,
}: {
  userId: string;
  deliverableId: number;
  courseId: number;
  defaultDate: string;
  onAdded: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [plannedDate, setPlannedDate] = useState<string | null>(defaultDate);
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

  function close() {
    if (isPending) return;
    setOpen(false);
  }

  async function handleSubmit() {
    if (!title.trim() || !category.trim() || !plannedDate) {
      setError("Title, category, and a planned date are all required.");
      return;
    }
    const parsedMinutes = estimatedMinutes.trim() === "" ? undefined : Number(estimatedMinutes);
    if (parsedMinutes != null && (Number.isNaN(parsedMinutes) || parsedMinutes <= 0)) {
      setError("Estimated minutes must be a positive number, if given at all.");
      return;
    }
    setError(undefined);
    setIsPending(true);
    const result = await addDeliverableTaskAction(userId, {
      deliverableId,
      courseId,
      title: title.trim(),
      category: category.trim(),
      plannedDate,
      ...(parsedMinutes != null ? { estimatedMinutes: parsedMinutes } : {}),
    });
    setIsPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.show(`${title.trim()} added.`, "success");
    setOpen(false);
    setTitle("");
    setCategory("");
    setEstimatedMinutes("");
    onAdded();
  }

  return (
    <>
      <Button variant="secondary" onPress={() => setOpen(true)}>
        Add task
      </Button>
      <Modal
        visible={open}
        onClose={close}
        title="Add a task"
        dismissable={!isPending}
        footer={
          <>
            <Button variant="ghost" onPress={close} disabled={isPending}>
              Cancel
            </Button>
            <Button onPress={handleSubmit} loading={isPending}>
              Add task
            </Button>
          </>
        }
      >
        <View style={{ gap: space[4] }}>
          <Input label="Title" required placeholder="e.g. Draft outline" value={title} onChangeText={setTitle} />
          <Input label="Category" required placeholder="e.g. writing" value={category} onChangeText={setCategory} />
          <DatePicker label="Planned date" required value={plannedDate} onValueChange={setPlannedDate} />
          <Input label="Estimated minutes (optional)" keyboardType="numeric" value={estimatedMinutes} onChangeText={setEstimatedMinutes} />
          {error ? <FieldError>{error}</FieldError> : null}
        </View>
      </Modal>
    </>
  );
}

/** Mirrors apps/web/src/components/deliverables/DeliverableTasksSection.tsx exactly. */
export function DeliverableTasksSection({
  userId,
  deliverableId,
  courseId,
  tasks,
  today,
  onChanged,
}: {
  userId: string;
  deliverableId: number;
  courseId: number;
  tasks: Task[];
  today: string;
  onChanged: () => void;
}) {
  return (
    <View style={{ gap: space[3] }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={textStyle("label", color.inkMuted)}>Tasks</Text>
        <AddTaskModal userId={userId} deliverableId={deliverableId} courseId={courseId} defaultDate={today} onAdded={onChanged} />
      </View>
      <Panel>
        {tasks.length === 0 ? (
          <Text style={textStyle("bodyS", color.inkMuted)}>No tasks linked to this assignment yet.</Text>
        ) : (
          <View style={{ gap: space[3] }}>
            {tasks.map((task, i) => (
              <TaskRow key={task.id} userId={userId} task={task} isLast={i === tasks.length - 1} />
            ))}
          </View>
        )}
      </Panel>
    </View>
  );
}
