"use client";

import { useEffect, useState, useTransition } from "react";
import type { AnnouncementChange, AnnouncementDiff } from "@collegeos/api";
import { Button, DatePicker, Modal, Panel, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/ToastProvider";
import {
  confirmAnnouncementServerAction,
  loadAnnouncementDiffAction,
  loadDeliverableTitlesAction,
  parseAnnouncementServerAction,
} from "@/app/(app)/courses/[id]/announcementActions";

type FlowState =
  | { step: "compose" }
  | { step: "filed" }
  | { step: "review"; announcementId: number; changes: AnnouncementChange[]; edited: boolean }
  | { step: "applied"; summary: string };

/**
 * The announcement paste flow, web port -- same phases and the same confirmation grammar
 * as mobile's /announcement screen, because both drive the identical parse-announcement /
 * announcement-confirm functions. Web is the natural home for this flow (pasting long
 * text is a desktop gesture), which is exactly why the port exists.
 */
export function AnnouncementPasteModal({ courseId }: { courseId: number }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FlowState>({ step: "compose" });
  const [rawText, setRawText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [titles, setTitles] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    void loadDeliverableTitlesAction(courseId).then((r) => {
      if (r.ok && r.data) setTitles(r.data);
    });
  }, [open, courseId]);

  function reset() {
    setState({ step: "compose" });
    setRawText("");
    setError(null);
  }

  function onParse() {
    setError(null);
    startTransition(async () => {
      const result = await parseAnnouncementServerAction(courseId, rawText);
      if (!result.ok || !result.data) {
        setError(result.error ?? "Parsing failed.");
        return;
      }
      if (result.data.kind === "noSchedulableContent") {
        setState({ step: "filed" });
        return;
      }
      const diff = await loadAnnouncementDiffAction(result.data.announcementId);
      if (!diff.ok || !diff.data) {
        setError(diff.error ?? "Could not load the staged diff.");
        return;
      }
      setState({ step: "review", announcementId: result.data.announcementId, changes: diff.data, edited: false });
    });
  }

  function patchChange(index: number, patch: Partial<AnnouncementChange>) {
    setState((prev) => {
      if (prev.step !== "review") return prev;
      const changes = prev.changes.map((c, i) => (i === index ? ({ ...c, ...patch } as AnnouncementChange) : c));
      return { ...prev, changes, edited: true };
    });
  }

  function onDecision(decision: "confirm" | "reject") {
    if (state.step !== "review") return;
    setError(null);
    const current = state;
    startTransition(async () => {
      const diff: AnnouncementDiff = { changes: current.changes };
      const result = await confirmAnnouncementServerAction(courseId, {
        announcementId: current.announcementId,
        decision: decision === "reject" ? "rejected" : current.edited ? "edited" : "confirmed",
        ...(decision === "confirm" && current.edited ? { editedDiff: diff } : {}),
      });
      if (!result.ok) {
        // 422s name exactly what to fix; the review stays open for the edit.
        setError(result.error ?? "Confirm failed.");
        return;
      }
      if (decision === "reject") {
        toast.show("Announcement rejected.");
        setOpen(false);
        reset();
        return;
      }
      const a = result.data?.applied;
      setState({
        step: "applied",
        summary:
          a != null
            ? `${a.dateChanges} date change${a.dateChanges === 1 ? "" : "s"}, ${a.newItems} new item${a.newItems === 1 ? "" : "s"}, ${a.notes} note${a.notes === 1 ? "" : "s"}.`
            : "Applied.",
      });
    });
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Paste an announcement
      </Button>
      <Modal open={open} onClose={() => { setOpen(false); reset(); }} title="Announcement">
        {error != null ? <p className="text-sm text-risk-critical">{error}</p> : null}

        {state.step === "compose" ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-muted">
              Paste what the professor posted. You&apos;ll review every change before anything moves.
            </p>
            <Textarea
              label="Announcement"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Quiz 4 is moved to Oct 10…"
              rows={6}
              disabled={isPending}
            />
            <Button onClick={onParse} disabled={isPending || rawText.trim().length === 0} loading={isPending}>
              {isPending ? "Reading…" : "Parse it"}
            </Button>
          </div>
        ) : null}

        {state.step === "filed" ? (
          <div className="flex flex-col gap-3">
            <p className="text-base text-ink">Nothing schedulable</p>
            <p className="text-sm text-ink-muted">Filed to the course. No dates moved, nothing to confirm.</p>
            <Button variant="secondary" onClick={() => { setOpen(false); reset(); }}>
              Done
            </Button>
          </div>
        ) : null}

        {state.step === "review" ? (
          <div className="flex flex-col gap-4">
            <p className="text-xs uppercase tracking-wide text-ink-muted">
              Proposed changes — nothing applies until you confirm
            </p>
            {state.changes.map((change, index) => (
              <Panel key={index}>
                {change.kind === "date_change" ? (
                  <div className="flex flex-col gap-3">
                    <p className="text-xs uppercase tracking-wide text-ink-muted">Date change</p>
                    <Select
                      label="Item"
                      options={titles.map((t) => ({ value: t, label: t }))}
                      value={change.matchedTitle}
                      onValueChange={(v) => patchChange(index, { matchedTitle: v })}
                    />
                    <DatePicker
                      label={
                        change.newDueDate == null
                          ? `New date — unresolved: "${change.newDueText ?? "?"}"`
                          : "New date"
                      }
                      value={change.newDueDate}
                      onValueChange={(v) => patchChange(index, { newDueDate: v })}
                      {...(change.newDueDate == null
                        ? { error: "Pick a real date; the server won't guess." }
                        : {})}
                    />
                  </div>
                ) : change.kind === "new_item" ? (
                  <div className="flex flex-col gap-3">
                    <p className="text-xs uppercase tracking-wide text-ink-muted">
                      New {change.itemType.replace("_", " ")}: {change.title}
                    </p>
                    <DatePicker
                      label={change.dueDate == null ? `Due — unresolved: "${change.dueText ?? "?"}"` : "Due"}
                      value={change.dueDate}
                      onValueChange={(v) => patchChange(index, { dueDate: v })}
                      {...(change.dueDate == null ? { error: "Pick a real date; the server won't guess." } : {})}
                    />
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    <p className="text-xs uppercase tracking-wide text-ink-muted">Note — no schedule change</p>
                    <p className="text-sm text-ink">{change.text}</p>
                  </div>
                )}
                <p className="mt-3 border-l-2 border-hairline pl-3 text-xs text-ink-faint">
                  “{change.sourceSnippet}”
                </p>
              </Panel>
            ))}
            <Button onClick={() => onDecision("confirm")} disabled={isPending} loading={isPending}>
              {state.edited ? "Apply edited changes" : "Apply changes"}
            </Button>
            <Button variant="secondary" onClick={() => onDecision("reject")} disabled={isPending}>
              Reject
            </Button>
          </div>
        ) : null}

        {state.step === "applied" ? (
          <div className="flex flex-col gap-3">
            <p className="text-base text-ink">Applied</p>
            <p className="text-sm text-ink-muted">{state.summary}</p>
            <Button variant="secondary" onClick={() => { setOpen(false); reset(); }}>
              Done
            </Button>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
