import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { space } from "@collegeos/design/native";
import { Button, FieldError, Input, Modal } from "../ui";
import { useToast } from "../ui/ToastProvider";
import { createCourseAction } from "../../lib/courseActions";
import { useAuthSession } from "../../lib/useAuthSession";

/** Mirrors apps/web/src/components/courses/AddCourseModal.tsx exactly -- same required
 *  fields (code, name, term), same "everything else is edited on the course's own detail
 *  page afterward" scope. Self-contained: owns its own open state and trigger button, so
 *  it can be rendered more than once on a screen (header action + empty-state action) the
 *  same way the web version is. */
export function AddCourseModal({ onCreated }: { onCreated?: () => void } = {}) {
  const router = useRouter();
  const toast = useToast();
  const { session } = useAuthSession();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [term, setTerm] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);

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

  async function handleSubmit() {
    if (!code.trim() || !name.trim() || !term.trim()) {
      setError("Code, name, and term are all required.");
      return;
    }
    if (!session) {
      setError("Not signed in.");
      return;
    }
    setError(undefined);
    setIsPending(true);
    const result = await createCourseAction(session.user.id, { code: code.trim(), name: name.trim(), term: term.trim() });
    setIsPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.show(`${code.trim()} added.`, "success");
    setOpen(false);
    reset();
    onCreated?.();
    router.push(`/courses/${result.courseId}`);
  }

  return (
    <>
      <Button onPress={() => setOpen(true)}>Add course</Button>
      <Modal
        visible={open}
        onClose={handleClose}
        title="Add a course"
        dismissable={!isPending}
        footer={
          <>
            <Button variant="ghost" onPress={handleClose} disabled={isPending}>
              Cancel
            </Button>
            <Button onPress={handleSubmit} loading={isPending}>
              Add course
            </Button>
          </>
        }
      >
        <View style={{ gap: space[4] }}>
          <Input label="Code" required placeholder="e.g. BME 301" value={code} onChangeText={setCode} />
          <Input label="Name" required placeholder="e.g. Biomedical Instrumentation" value={name} onChangeText={setName} />
          <Input label="Term" required placeholder="e.g. Fall 2026" value={term} onChangeText={setTerm} />
          {error ? <FieldError>{error}</FieldError> : null}
        </View>
      </Modal>
    </>
  );
}
