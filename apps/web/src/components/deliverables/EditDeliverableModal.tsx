"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Deliverable, DeliverableType } from "@collegeos/api";
import { Button, DatePicker, Input, Modal, Select } from "@/components/ui";
import { useToast } from "@/components/ui/ToastProvider";
import { deleteDeliverableAction, updateDeliverableAction } from "@/app/(app)/deliverables/[id]/actions";

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

export function EditDeliverableModal({ deliverable }: { deliverable: Deliverable }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(deliverable.title);
  const [type, setType] = useState<string | null>(deliverable.type);
  const [dueDate, setDueDate] = useState<string | null>(deliverable.local_due_date);
  const [estimatedMinutes, setEstimatedMinutes] = useState(deliverable.estimated_minutes != null ? String(deliverable.estimated_minutes) : "");
  const [status, setStatus] = useState<string | null>(deliverable.status);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function close() {
    if (isPending) return;
    setOpen(false);
  }

  function handleSubmit() {
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
    startTransition(async () => {
      const result = await updateDeliverableAction(deliverable.id, {
        title: title.trim(),
        type: type as DeliverableType,
        dueDate,
        estimatedMinutes: parsedMinutes,
        status: (status ?? deliverable.status) as Deliverable["status"],
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.show("Assignment updated.", "success");
      setOpen(false);
      router.refresh();
    });
  }

  function handleDelete() {
    startTransition(async () => {
      // deleteDeliverableAction redirects on success (throws Next's redirect signal,
      // which must propagate uncaught); it only returns a real value on failure.
      const result = await deleteDeliverableAction(deliverable.id, deliverable.course_id);
      if (!result.ok) toast.show(result.error ?? "Couldn't delete this assignment.", "error");
    });
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Edit
      </Button>
      <Modal
        open={open}
        onClose={close}
        title="Edit assignment"
        dismissable={!isPending}
        footer={
          <>
            <Button variant="destructive" onClick={handleDelete} loading={isPending} className="mr-auto">
              Delete
            </Button>
            <Button variant="ghost" onClick={close} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={isPending}>
              Save
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          <Select label="Type" required options={TYPE_OPTIONS} value={type} onValueChange={setType} />
          <DatePicker label="Due date" required value={dueDate} onValueChange={setDueDate} />
          <Input
            label="Estimated minutes"
            type="number"
            min={1}
            value={estimatedMinutes}
            onChange={(e) => setEstimatedMinutes(e.target.value)}
          />
          <Select label="Status" options={STATUS_OPTIONS} value={status} onValueChange={setStatus} />
          {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}
        </div>
      </Modal>
    </>
  );
}
