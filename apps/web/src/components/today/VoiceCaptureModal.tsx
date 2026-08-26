"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { parseUtterance, type ParsedUtterance } from "@collegeos/core";
import { Button, DatePicker, Modal, TimePicker } from "@/components/ui";
import { useToast } from "@/components/ui/ToastProvider";
import { DictatedTextarea } from "@/components/review/DictatedTextarea";
import { addTaskAction } from "@/app/(app)/today/actions";

/**
 * Voice capture, web half (FOLLOWUPS V2 Phase 1, option B): DictatedTextarea supplies
 * the mic (degrading to typing where the API is absent), core's parseUtterance supplies
 * the DETERMINISTIC parse, and the editable preview is the gate -- nothing persists
 * until Save, and the category defaults to Admin visibly, mirroring the Night Plan's
 * wording. Same parser, same rules as mobile's /capture; behaviour may never diverge
 * across platforms, idiom may.
 */
export function VoiceCaptureModal({ today }: { today: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [utterance, setUtterance] = useState("");
  const [dateOverride, setDateOverride] = useState<string | null>(null);
  const [timeOverride, setTimeOverride] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const parsed: ParsedUtterance = useMemo(() => {
    const now = new Date();
    return parseUtterance(utterance, {
      today,
      nowMinutesIntoDay: now.getHours() * 60 + now.getMinutes(),
    });
  }, [utterance, today]);

  const effectiveDate = dateOverride ?? parsed.date;
  const effectiveTime =
    timeOverride ??
    (parsed.time != null
      ? `${String(parsed.time.hour).padStart(2, "0")}:${String(parsed.time.minute).padStart(2, "0")}`
      : null);

  function close() {
    if (isPending) return;
    setOpen(false);
    setUtterance("");
    setDateOverride(null);
    setTimeOverride(null);
    setError(null);
  }

  function onSave() {
    setError(null);
    startTransition(async () => {
      const result = await addTaskAction({
        title: parsed.title.trim(),
        category: "admin",
        plannedDate: effectiveDate ?? today,
        ...(effectiveTime != null ? { startTime: effectiveTime } : {}),
      });
      if (!result.ok) {
        setError(result.error ?? "Could not save the task.");
        return;
      }
      toast.show(`Saved: "${parsed.title.trim()}"`, "success");
      close();
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Capture
      </Button>
      <Modal open={open} onClose={close} title="Capture">
        <div className="flex flex-col gap-4">
          <DictatedTextarea
            label="What needs doing?"
            value={utterance}
            onValueChange={(t: string) => {
              setUtterance(t);
              setDateOverride(null);
              setTimeOverride(null);
            }}
            rows={2}
          />
          {utterance.trim() !== "" ? (
            <>
              <p className="text-body-l text-ink">{parsed.title || "(no title yet)"}</p>
              {parsed.matched.length > 0 ? (
                <p className="text-caption text-ink-faint">Understood: {parsed.matched.join(" · ")}</p>
              ) : null}
              <DatePicker
                label={effectiveDate == null ? "Date — none heard; defaults to today" : "Date"}
                value={effectiveDate}
                onValueChange={setDateOverride}
              />
              <TimePicker label="Start time (optional)" value={effectiveTime} onValueChange={setTimeOverride} />
              <p className="text-caption text-ink-faint">Filed as Admin — change the category on Today.</p>
              {error != null ? <p className="text-body-s text-risk-critical">{error}</p> : null}
              <div className="flex gap-3">
                <Button onClick={onSave} loading={isPending} disabled={isPending || parsed.title.trim() === ""}>
                  Save task
                </Button>
                <Button variant="secondary" onClick={close} disabled={isPending}>
                  Cancel
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
