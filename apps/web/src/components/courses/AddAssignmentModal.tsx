"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { DeliverableType } from "@collegeos/api";
import { Button, DatePicker, Input, Modal, Select } from "@/components/ui";
import { useToast } from "@/components/ui/ToastProvider";
import { createDeliverableAction } from "@/app/(app)/courses/[id]/actions";

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

export function AddAssignmentModal({ courseId }: { courseId: number }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

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

  function handleSubmit() {
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
    startTransition(async () => {
      const result = await createDeliverableAction({
        courseId,
        title: title.trim(),
        type: type as DeliverableType,
        dueDate,
        ...(parsedMinutes != null ? { estimatedMinutes: parsedMinutes } : {}),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.show(`${title.trim()} added.`, "success");
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Add assignment
      </Button>
      <Modal
        open={open}
        onClose={close}
        title="Add an assignment"
        dismissable={!isPending}
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={isPending}>
              Add assignment
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input label="Title" required placeholder="e.g. Homework 5" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Select label="Type" required options={TYPE_OPTIONS} value={type} onValueChange={setType} />
          <DatePicker label="Due date" required value={dueDate} onValueChange={setDueDate} />
          <Input
            label="Estimated minutes (optional)"
            type="number"
            min={1}
            placeholder="Leave blank if unknown"
            value={estimatedMinutes}
            onChange={(e) => setEstimatedMinutes(e.target.value)}
          />
          {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}
        </div>
      </Modal>
    </>
  );
}
