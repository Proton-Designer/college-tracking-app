"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Input, Modal } from "@/components/ui";
import { useToast } from "@/components/ui/ToastProvider";
import { createCourseAction } from "@/app/(app)/courses/actions";

/** E1: /courses had an "Add course" empty-state offer with no action behind it. Code,
 *  name, and term are the only required fields (courses table) -- weight categories,
 *  grade boundaries, professor info, and policies are all edited afterward on the
 *  course's own detail page, not crammed into this first form. */
export function AddCourseModal() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [term, setTerm] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setCode("");
    setName("");
    setTerm("");
    setError(undefined);
  }

  function handleClose() {
    if (isPending) return;
    setOpen(false);
    reset();
  }

  function handleSubmit() {
    if (!code.trim() || !name.trim() || !term.trim()) {
      setError("Code, name, and term are all required.");
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const result = await createCourseAction({ code: code.trim(), name: name.trim(), term: term.trim() });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.show(`${code.trim()} added.`, "success");
      setOpen(false);
      reset();
      router.push(`/courses/${result.courseId}`);
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Add course</Button>
      <Modal
        open={open}
        onClose={handleClose}
        title="Add a course"
        dismissable={!isPending}
        footer={
          <>
            <Button variant="ghost" onClick={handleClose} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={isPending}>
              Add course
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input label="Code" required placeholder="e.g. BME 301" value={code} onChange={(e) => setCode(e.target.value)} />
          <Input label="Name" required placeholder="e.g. Biomedical Instrumentation" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Term" required placeholder="e.g. Fall 2026" value={term} onChange={(e) => setTerm(e.target.value)} />
          {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}
        </div>
      </Modal>
    </>
  );
}
