"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { GradeBoundaryRow } from "@collegeos/api";
import { Button, Input, Modal } from "@/components/ui";
import { useToast } from "@/components/ui/ToastProvider";
import { deleteGradeBoundaryAction, upsertGradeBoundaryAction } from "@/app/(app)/courses/[id]/actions";

export function GradeBoundariesSection({ courseId, boundaries }: { courseId: number; boundaries: GradeBoundaryRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [letter, setLetter] = useState("");
  const [minPct, setMinPct] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<number | null>(null);

  function openAdd() {
    setLetter("");
    setMinPct("");
    setError(undefined);
    setOpen(true);
  }

  function close() {
    if (isPending) return;
    setOpen(false);
  }

  function handleSubmit() {
    const parsedMin = Number(minPct);
    if (!letter.trim() || minPct.trim() === "" || Number.isNaN(parsedMin) || parsedMin < 0 || parsedMin > 100) {
      setError("A letter and a minimum percent (0-100) are required.");
      return;
    }
    setError(undefined);
    startTransition(async () => {
      const result = await upsertGradeBoundaryAction({ courseId, letter: letter.trim(), minPct: parsedMin });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.show(`${letter.trim()} boundary saved.`, "success");
      setOpen(false);
      router.refresh();
    });
  }

  function handleDelete(boundaryId: number) {
    setDeletingId(boundaryId);
    startTransition(async () => {
      const result = await deleteGradeBoundaryAction(courseId, boundaryId);
      setDeletingId(null);
      if (!result.ok) {
        toast.show(result.error ?? "Couldn't delete this boundary.", "error");
        return;
      }
      toast.show("Boundary deleted.", "success");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Grade boundaries</span>
      {boundaries.length > 0 ? (
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-body-s tabular-nums text-ink">
          {boundaries.map((b) => (
            <li key={b.id} className="flex items-center gap-1.5">
              {b.letter} {Math.round(Number(b.min_pct))}%+
              <button
                type="button"
                onClick={() => handleDelete(b.id)}
                disabled={deletingId === b.id}
                aria-label={`Delete ${b.letter} boundary`}
                className="text-caption text-ink-faint hover:text-risk-critical disabled:opacity-40"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-body-s text-ink">Not recorded</span>
      )}
      <button
        type="button"
        onClick={openAdd}
        className="self-start font-mono text-caption uppercase tracking-[0.08em] text-accent underline underline-offset-2"
      >
        + Add boundary
      </button>

      <Modal
        open={open}
        onClose={close}
        title="Add a grade boundary"
        dismissable={!isPending}
        footer={
          <>
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
          <Input label="Letter" required placeholder="e.g. A" value={letter} onChange={(e) => setLetter(e.target.value)} />
          <Input
            label="Minimum percent"
            required
            type="number"
            min={0}
            max={100}
            value={minPct}
            onChange={(e) => setMinPct(e.target.value)}
          />
          <p className="text-body-s text-ink-faint">Saving a letter that already exists on this course replaces its cutoff.</p>
          {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}
        </div>
      </Modal>
    </div>
  );
}
