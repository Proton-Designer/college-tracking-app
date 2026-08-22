import { color, space } from "@collegeos/design/native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { Course } from "@collegeos/api";
import { Button, FieldError, Input, Modal, Select } from "../ui";
import { useToast } from "../ui/ToastProvider";
import { textStyle } from "../../design/typography";
import { addTaskAction } from "../../lib/todayActions";

const PERSONAL_TASK_VALUE = "__personal__";

/** Mirrors apps/web/src/components/today/QuickAddTaskModal.tsx exactly. */
export function QuickAddTaskModal({ userId, today, courses, onAdded }: { userId: string; today: string; courses: Record<number, Course>; onAdded: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [courseValue, setCourseValue] = useState<string | null>(PERSONAL_TASK_VALUE);
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

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

  async function handleSubmit() {
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
    setIsPending(true);
    const result = await addTaskAction(userId, {
      title: title.trim(),
      category: category.trim(),
      plannedDate: today,
      ...(courseValue && courseValue !== PERSONAL_TASK_VALUE ? { courseId: Number(courseValue) } : {}),
      ...(parsedMinutes != null ? { estimatedMinutes: parsedMinutes } : {}),
    });
    setIsPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.show(`${title.trim()} added to today.`, "success");
    setOpen(false);
    reset();
    onAdded();
  }

  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button">
        <Text style={textStyle("caption", color.accent)}>+ Add task</Text>
      </Pressable>
      <Modal
        visible={open}
        onClose={close}
        title="Add a task for today"
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
          <Input label="Title" required placeholder="e.g. Read Ch. 5" value={title} onChangeText={setTitle} />
          <Input label="Category" required placeholder="e.g. reading" value={category} onChangeText={setCategory} />
          <Select label="Course" options={courseOptions} value={courseValue} onValueChange={setCourseValue} />
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
