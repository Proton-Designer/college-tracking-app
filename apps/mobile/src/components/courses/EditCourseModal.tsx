import { space } from "@collegeos/design/native";
import { useState } from "react";
import { View } from "react-native";
import type { Course } from "@collegeos/api";
import { Button, FieldError, Input, Modal, Textarea } from "../ui";
import { useToast } from "../ui/ToastProvider";
import { updateCourseAction } from "../../lib/courseActions";

/** Mirrors apps/web/src/components/courses/EditCourseModal.tsx exactly, including the
 *  archive/un-archive toggle sharing the same action (courses.archived_at). */
export function EditCourseModal({ userId, course, onSaved }: { userId: string; course: Course; onSaved: () => void }) {
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
  const [isPending, setIsPending] = useState(false);

  function handleClose() {
    if (isPending) return;
    setOpen(false);
  }

  async function handleSubmit() {
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
    setIsPending(true);
    const result = await updateCourseAction(userId, course.id, {
      code: code.trim(),
      name: name.trim(),
      term: term.trim(),
      professorName: professorName.trim() || null,
      targetGradePct: parsedTarget,
      latePolicy: latePolicy.trim() || null,
      attendancePolicy: attendancePolicy.trim() || null,
    });
    setIsPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.show("Course updated.", "success");
    setOpen(false);
    onSaved();
  }

  async function handleArchiveToggle() {
    setIsPending(true);
    const result = await updateCourseAction(userId, course.id, {
      archivedAt: course.archived_at != null ? null : new Date().toISOString(),
    });
    setIsPending(false);
    if (!result.ok) {
      toast.show(result.error ?? "Couldn't update the course.", "error");
      return;
    }
    toast.show(course.archived_at != null ? "Course un-archived." : "Course archived.", "success");
    setOpen(false);
    onSaved();
  }

  return (
    <>
      <Button variant="secondary" onPress={() => setOpen(true)}>
        Edit course
      </Button>
      <Modal
        visible={open}
        onClose={handleClose}
        title="Edit course"
        dismissable={!isPending}
        footer={
          <View style={{ flex: 1, flexDirection: "row", justifyContent: "space-between", gap: space[3] }}>
            <Button variant="destructive" onPress={handleArchiveToggle} loading={isPending}>
              {course.archived_at != null ? "Un-archive" : "Archive"}
            </Button>
            <View style={{ flexDirection: "row", gap: space[3] }}>
              <Button variant="ghost" onPress={handleClose} disabled={isPending}>
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
          <Input label="Code" required value={code} onChangeText={setCode} />
          <Input label="Name" required value={name} onChangeText={setName} />
          <Input label="Term" required value={term} onChangeText={setTerm} />
          <Input label="Professor" value={professorName} onChangeText={setProfessorName} />
          <Input
            label="Target grade (%)"
            keyboardType="numeric"
            value={targetGradePct}
            onChangeText={setTargetGradePct}
          />
          <Textarea label="Late policy" value={latePolicy} onChangeText={setLatePolicy} rows={2} />
          <Textarea label="Attendance policy" value={attendancePolicy} onChangeText={setAttendancePolicy} rows={2} />
          {error ? <FieldError>{error}</FieldError> : null}
        </View>
      </Modal>
    </>
  );
}
