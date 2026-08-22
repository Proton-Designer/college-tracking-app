"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Course } from "@collegeos/api";
import { Button, Input, Modal, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/ToastProvider";
import { updateCourseAction } from "@/app/(app)/courses/[id]/actions";

export function EditCourseModal({ course }: { course: Course }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(course.code);
  const [name, setName] = useState(course.name);
  const [term, setTerm] = useState(course.term);
  const [professorName, setProfessorName] = useState(course.professor_name ?? "");
  const [targetGradePct, setTargetGradePct] = useState(course.target_grade_pct != null ? String(course.target_grade_pct) : "");
  const [latePolicy, setLatePolicy] = useState(course.late_policy ?? "");
  const [attendancePolicy, setAttendancePolicy] = useState(course.attendance_policy ?? "");
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function handleClose() {
    if (isPending) return;
    setOpen(false);
  }

  function handleSubmit() {
    if (!code.trim() || !name.trim() || !term.trim()) {
      setError("Code, name, and term are all required.");
      return;
    }
    const parsedTarget = targetGradePct.trim() === "" ? null : Number(targetGradePct);
    if (parsedTarget != null && (Number.isNaN(parsedTarget) || parsedTarget < 0 || parsedTarget > 100)) {
      setError("Target grade must be a number between 0 and 100.");
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const result = await updateCourseAction(course.id, {
        code: code.trim(),
        name: name.trim(),
        term: term.trim(),
        professorName: professorName.trim() || null,
        targetGradePct: parsedTarget,
        latePolicy: latePolicy.trim() || null,
        attendancePolicy: attendancePolicy.trim() || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.show("Course updated.", "success");
      setOpen(false);
      router.refresh();
    });
  }

  function handleArchiveToggle() {
    startTransition(async () => {
      const result = await updateCourseAction(course.id, {
        archivedAt: course.archived_at != null ? null : new Date().toISOString(),
      });
      if (!result.ok) {
        toast.show(result.error ?? "Couldn't update the course.", "error");
        return;
      }
      toast.show(course.archived_at != null ? "Course un-archived." : "Course archived.", "success");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Edit course
      </Button>
      <Modal
        open={open}
        onClose={handleClose}
        title="Edit course"
        dismissable={!isPending}
        footer={
          <>
            <Button
              variant="destructive"
              onClick={handleArchiveToggle}
              loading={isPending}
              className="mr-auto"
            >
              {course.archived_at != null ? "Un-archive" : "Archive"}
            </Button>
            <Button variant="ghost" onClick={handleClose} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={isPending}>
              Save
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input label="Code" required value={code} onChange={(e) => setCode(e.target.value)} />
          <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Term" required value={term} onChange={(e) => setTerm(e.target.value)} />
          <Input label="Professor" value={professorName} onChange={(e) => setProfessorName(e.target.value)} />
          <Input
            label="Target grade (%)"
            type="number"
            min={0}
            max={100}
            value={targetGradePct}
            onChange={(e) => setTargetGradePct(e.target.value)}
          />
          <Textarea label="Late policy" value={latePolicy} onChange={(e) => setLatePolicy(e.target.value)} rows={2} />
          <Textarea label="Attendance policy" value={attendancePolicy} onChange={(e) => setAttendancePolicy(e.target.value)} rows={2} />
          {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}
        </div>
      </Modal>
    </>
  );
}
