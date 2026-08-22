"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { SyllabusExtractionRow } from "@collegeos/api";
import { Button, Modal } from "@/components/ui";
import { useToast } from "@/components/ui/ToastProvider";
import { confirmExtractionAction, uploadSyllabusAction } from "@/app/(app)/courses/[id]/syllabusActions";

function itemLabel(item: SyllabusExtractionRow): string {
  const payload = item.extracted_payload as Record<string, unknown>;
  switch (item.item_type) {
    case "course_info":
      return `Course info: ${payload.code ?? ""} ${payload.name ?? ""}`.trim();
    case "assignment":
      return `Assignment: ${payload.title ?? "Untitled"} · due ${payload.dueDate ?? "unresolved date"}`;
    case "exam":
      return `Exam: ${payload.title ?? "Untitled"} · ${payload.date ?? "unresolved date"}`;
    case "grade_category":
      return `Grade category: ${payload.name ?? ""} · ${payload.weightPct ?? "?"}%`;
    case "office_hours":
      return `Office hours: day ${payload.dayOfWeek ?? "?"}, ${payload.startTime ?? "?"}–${payload.endTime ?? "?"}`;
    case "policy":
      return `Policy (${payload.kind ?? "other"}): ${String(payload.text ?? "").slice(0, 80)}`;
    default:
      return item.item_type;
  }
}

type FlowState =
  | { step: "idle" }
  | { step: "error"; message: string }
  | { step: "reviewing"; uploadId: number; items: SyllabusExtractionRow[] };

export function UploadSyllabusModal({ courseId }: { courseId: number }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FlowState>({ step: "idle" });
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function close() {
    if (isPending) return;
    setOpen(false);
    setState({ step: "idle" });
  }

  function handleUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setState({ step: "error", message: "Choose a PDF, PNG, or JPEG file first." });
      return;
    }
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      // A thrown server error (network failure invoking the Edge Function, an
      // unexpected exception) must still resolve to a real, visible state -- not
      // silently revert to idle and leave the user staring at a button that looks like
      // nothing happened.
      try {
        const result = await uploadSyllabusAction(formData, courseId);
        if (!result.ok) {
          setState({ step: "error", message: result.error });
          return;
        }
        if (!result.extraction.ok) {
          // Honest, explicit state -- never a spinner that never resolves, never a
          // fabricated result. The file uploaded successfully; only extraction failed
          // (most commonly: no ANTHROPIC_API_KEY configured on this server).
          setState({
            step: "error",
            message: `Your file uploaded, but extraction couldn't run: ${result.extraction.error} Add this course's assignments manually below instead.`,
          });
          return;
        }
        if (result.extraction.items.length === 0) {
          setState({ step: "error", message: "Extraction ran but found nothing usable in this file. Add assignments manually below instead." });
          return;
        }
        setState({ step: "reviewing", uploadId: result.uploadId, items: result.extraction.items });
      } catch (err) {
        setState({
          step: "error",
          message: `Couldn't reach the server to extract this file (${err instanceof Error ? err.message : "unknown error"}). Add this course's assignments manually below instead.`,
        });
      }
    });
  }

  function decide(extractionId: number, decision: "confirmed" | "rejected") {
    startTransition(async () => {
      try {
        const result = await confirmExtractionAction(courseId, extractionId, decision);
        if (!result.ok) {
          toast.show(`Couldn't save that decision: ${result.error ?? "unknown error"}.`, "error");
          return;
        }
        if (state.step === "reviewing") {
          const remaining = state.items.filter((i) => i.id !== extractionId);
          setState({ ...state, items: remaining });
        }
        toast.show(decision === "confirmed" ? "Added to the course." : "Rejected.", "success");
        router.refresh();
      } catch (err) {
        toast.show(`Couldn't save that decision: ${err instanceof Error ? err.message : "unknown error"}.`, "error");
      }
    });
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Upload syllabus
      </Button>
      <Modal open={open} onClose={close} title="Upload a syllabus" dismissable={!isPending}>
        <div className="flex flex-col gap-4">
          <p className="text-body-s text-ink-muted">
            PDF, PNG, or JPEG, up to 10MB. Nothing is added to this course until you confirm each item below —
            extraction only stages a proposal.
          </p>

          {state.step === "idle" || state.step === "error" ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                className="text-body-s text-ink"
              />
              {state.step === "error" ? <p className="text-body-s text-risk-critical">{state.message}</p> : null}
              <div className="flex justify-end gap-3">
                <Button variant="ghost" onClick={close} disabled={isPending}>
                  Cancel
                </Button>
                <Button onClick={handleUpload} loading={isPending}>
                  Upload &amp; extract
                </Button>
              </div>
            </>
          ) : (
            <>
              {state.items.length === 0 ? (
                <p className="text-body-s text-ink-faint">Every item has been reviewed.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {state.items.map((item) => (
                    <li key={item.id} className="glass-sunken flex flex-col gap-2 rounded-md p-3">
                      <span className="text-body-s text-ink">{itemLabel(item)}</span>
                      <span className="font-mono text-caption text-ink-faint">
                        Model confidence: {Math.round(item.extraction_confidence * 100)}%
                      </span>
                      <div className="flex gap-3">
                        <Button variant="secondary" onClick={() => decide(item.id, "confirmed")} disabled={isPending}>
                          Confirm
                        </Button>
                        <Button variant="ghost" onClick={() => decide(item.id, "rejected")} disabled={isPending}>
                          Reject
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setOpen(false);
                    setState({ step: "idle" });
                    router.refresh();
                  }}
                >
                  Done
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
