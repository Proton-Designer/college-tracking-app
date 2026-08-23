"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Task, TaskProofOfWorkType } from "@collegeos/api";
import { Button, DatePicker, Input, Modal, Panel, Select, Toggle } from "@/components/ui";
import { useToast } from "@/components/ui/ToastProvider";
import { addDeliverableTaskAction, setTaskProofOfWorkAction } from "@/app/(app)/deliverables/[id]/actions";

const PROOF_TYPE_OPTIONS: { value: TaskProofOfWorkType; label: string }[] = [
  { value: "confirmation_attachment", label: "Attachment" },
  { value: "practice_question_count", label: "Practice question count" },
  { value: "git_commit", label: "Git commit" },
  { value: "summary_text", label: "Written summary" },
  { value: "whoop_workout", label: "WHOOP workout" },
];

function TaskRow({ task, deliverableId }: { task: Task; deliverableId: number }) {
  const router = useRouter();
  const toast = useToast();
  const [requiresProof, setRequiresProof] = useState(task.requires_proof_of_work);
  const [proofType, setProofType] = useState<string | null>(task.proof_of_work_type);
  const [isPending, startTransition] = useTransition();

  function save(nextRequires: boolean, nextType: string | null) {
    if (nextRequires && !nextType) return; // wait for a type before saving
    startTransition(async () => {
      const result = await setTaskProofOfWorkAction({
        taskId: task.id,
        deliverableId,
        requiresProofOfWork: nextRequires,
        proofOfWorkType: nextRequires ? (nextType as TaskProofOfWorkType) : null,
      });
      if (!result.ok) {
        toast.show(result.error ?? "Couldn't update this task.", "error");
        return;
      }
      router.refresh();
    });
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
    <li className="flex flex-col gap-2 border-b border-hairline pb-3 last:border-b-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-body-s text-ink">{task.title}</span>
          <span className="font-mono text-caption tabular-nums text-ink-faint">
            {task.planned_date} · {task.status}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Toggle checked={requiresProof} onChange={handleToggle} label="Requires proof of work" disabled={isPending} />
        {requiresProof ? (
          <Select
            options={PROOF_TYPE_OPTIONS}
            value={proofType}
            onValueChange={handleTypeChange}
            placeholder="Proof type…"
            disabled={isPending}
            className="h-8 w-48"
          />
        ) : null}
      </div>
    </li>
  );
}

function AddTaskModal({ deliverableId, courseId, defaultDate }: { deliverableId: number; courseId: number; defaultDate: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [plannedDate, setPlannedDate] = useState<string | null>(defaultDate);
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function close() {
    if (isPending) return;
    setOpen(false);
  }

  function handleSubmit() {
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
    startTransition(async () => {
      const result = await addDeliverableTaskAction({
        deliverableId,
        courseId,
        title: title.trim(),
        category: category.trim(),
        plannedDate,
        ...(parsedMinutes != null ? { estimatedMinutes: parsedMinutes } : {}),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.show(`${title.trim()} added.`, "success");
      setOpen(false);
      setTitle("");
      setCategory("");
      setEstimatedMinutes("");
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Add task
      </Button>
      <Modal
        open={open}
        onClose={close}
        title="Add a task"
        dismissable={!isPending}
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={isPending}>
              Add task
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input label="Title" required placeholder="e.g. Draft outline" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input label="Category" required placeholder="e.g. writing" value={category} onChange={(e) => setCategory(e.target.value)} />
          <DatePicker label="Planned date" required value={plannedDate} onValueChange={setPlannedDate} />
          <Input
            label="Estimated minutes (optional)"
            type="number"
            min={1}
            value={estimatedMinutes}
            onChange={(e) => setEstimatedMinutes(e.target.value)}
          />
          {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}
        </div>
      </Modal>
    </>
  );
}

export function DeliverableTasksSection({
  deliverableId,
  courseId,
  tasks,
  today,
}: {
  deliverableId: number;
  courseId: number;
  tasks: Task[];
  today: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Tasks</h2>
        <AddTaskModal deliverableId={deliverableId} courseId={courseId} defaultDate={today} />
      </div>
      <Panel>
        {tasks.length === 0 ? (
          <p className="text-body-s text-ink-muted">No tasks linked to this assignment yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {tasks.map((task) => (
              <TaskRow key={task.id} task={task} deliverableId={deliverableId} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
