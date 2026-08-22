"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Course } from "@collegeos/api";
import { Button, Input, Modal, Select } from "@/components/ui";
import { useToast } from "@/components/ui/ToastProvider";
import { addTaskAction } from "@/app/(app)/today/actions";

const PERSONAL_TASK_VALUE = "__personal__";

export function QuickAddTaskModal({ today, courses }: { today: string; courses: Record<number, Course> }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [courseValue, setCourseValue] = useState<string | null>(PERSONAL_TASK_VALUE);
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  const courseOptions = [
    { value: PERSONAL_TASK_VALUE, label: "Personal (no course)" },
    ...Object.values(courses)
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((c) => ({ value: String(c.id), label: c.code })),
  ];

  function reset() {
    setTitle("");
    setCategory("");
    setCourseValue(PERSONAL_TASK_VALUE);
    setEstimatedMinutes("");
    setError(undefined);
  }

  function close() {
    if (isPending) return;
    setOpen(false);
    reset();
  }

  function handleSubmit() {
    if (!title.trim() || !category.trim()) {
      setError("Title and category are both required.");
      return;
    }
    const parsedMinutes = estimatedMinutes.trim() === "" ? undefined : Number(estimatedMinutes);
    if (parsedMinutes != null && (Number.isNaN(parsedMinutes) || parsedMinutes <= 0)) {
      setError("Estimated minutes must be a positive number, if given at all.");
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const result = await addTaskAction({
        title: title.trim(),
        category: category.trim(),
        plannedDate: today,
        ...(courseValue && courseValue !== PERSONAL_TASK_VALUE ? { courseId: Number(courseValue) } : {}),
        ...(parsedMinutes != null ? { estimatedMinutes: parsedMinutes } : {}),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.show(`${title.trim()} added to today.`, "success");
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-mono text-caption uppercase tracking-[0.08em] text-accent underline underline-offset-2"
      >
        + Add task
      </button>
      <Modal
        open={open}
        onClose={close}
        title="Add a task for today"
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
          <Input label="Title" required placeholder="e.g. Read Ch. 5" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input label="Category" required placeholder="e.g. reading" value={category} onChange={(e) => setCategory(e.target.value)} />
          <Select label="Course" options={courseOptions} value={courseValue} onValueChange={setCourseValue} />
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
