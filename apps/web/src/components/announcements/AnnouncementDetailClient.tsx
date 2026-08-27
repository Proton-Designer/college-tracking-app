"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AnnouncementChange, AnnouncementDiff, AnnouncementRow } from "@collegeos/api";
import { Button, DatePicker, Panel, Select } from "@/components/ui";
import { reparseAnnouncementAction } from "@/app/(app)/announcements/announcementsActions";
import { confirmAnnouncementAction } from "@/app/(app)/announcements/[id]/announcementActions";

const STATUS_LABEL: Record<string, string> = {
  applied: "Applied",
  no_schedulable_content: "Filed — nothing schedulable",
  rejected: "Rejected",
  parsed: "Awaiting review",
  pending: "Not parsed yet",
  failed: "Parse failed",
};

export interface AnnouncementDetailClientProps {
  announcement: AnnouncementRow;
  /** Open deliverable titles for the matched-title Select on date_change rows. */
  titles: string[];
}

function extractChanges(announcement: AnnouncementRow): AnnouncementChange[] {
  const diff = announcement.parsed_diff as AnnouncementDiff | null;
  return diff?.changes ?? [];
}

/**
 * The diff review and the confirm gate -- same confirmation grammar as the syllabus
 * flow and mobile's AnnouncementScreen review step: the server holds the only write
 * path (announcementActions.ts's confirmAnnouncementAction), and everything here is
 * proposal and in-place editing until that one explicit call.
 *
 * Editing is inline on the diff rows: an unresolved date gets a DatePicker (the server
 * refuses to apply a null date, so resolving it here is the only way forward -- never a
 * server-side guess), and a date_change's matched title is a Select over the course's
 * real open deliverables, because a mismatched title is the one failure the parser
 * can't see for itself.
 */
export function AnnouncementDetailClient({ announcement, titles }: AnnouncementDetailClientProps) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();
  const [reparseBusy, setReparseBusy] = useState(false);
  const [appliedSummary, setAppliedSummary] = useState<string | null>(null);

  // Local editable copy of the diff, reset only when the server hands us a genuinely
  // different diff (id or status actually changed, e.g. a fresh reparse) -- not on
  // every incidental parent re-render, so in-progress edits survive a router.refresh()
  // elsewhere on the page.
  const currentKey = `${announcement.id}:${announcement.status}`;
  const [syncedKey, setSyncedKey] = useState(currentKey);
  const [changes, setChanges] = useState<AnnouncementChange[]>(() => extractChanges(announcement));
  const [edited, setEdited] = useState(false);
  if (currentKey !== syncedKey) {
    setSyncedKey(currentKey);
    setChanges(extractChanges(announcement));
    setEdited(false);
  }

  function patchChange(index: number, patch: Partial<AnnouncementChange>) {
    setChanges((prev) => prev.map((c, i) => (i === index ? ({ ...c, ...patch } as AnnouncementChange) : c)));
    setEdited(true);
  }

  function handleReparse() {
    setError(undefined);
    setReparseBusy(true);
    startTransition(async () => {
      const result = await reparseAnnouncementAction(announcement.id);
      setReparseBusy(false);
      if (!result.ok || !result.data) {
        setError(result.error ?? "Couldn't parse that announcement.");
        return;
      }
      router.refresh();
    });
  }

  function handleDecision(decision: "confirm" | "reject") {
    setError(undefined);
    startTransition(async () => {
      const diff: AnnouncementDiff = { changes };
      const result = await confirmAnnouncementAction({
        announcementId: announcement.id,
        decision: decision === "reject" ? "rejected" : edited ? "edited" : "confirmed",
        courseId: announcement.course_id,
        ...(decision === "confirm" && edited ? { editedDiff: diff } : {}),
      });
      if (!result.ok) {
        // Names exactly what to fix (an unresolved date, an unmatched title); surfacing
        // it verbatim IS the UX -- the review stays open for the edit, never a silent retry.
        setError(result.error ?? "Couldn't save that decision.");
        return;
      }
      if (decision === "reject") {
        router.push("/announcements");
        return;
      }
      const applied = result.data?.applied;
      setAppliedSummary(
        applied != null
          ? `${applied.dateChanges} date change${applied.dateChanges === 1 ? "" : "s"}, ${applied.newItems} new item${applied.newItems === 1 ? "" : "s"}, ${applied.notes} note${applied.notes === 1 ? "" : "s"}.`
          : "Applied.",
      );
    });
  }

  if (appliedSummary != null) {
    return (
      <Panel className="flex flex-col gap-3">
        <p className="text-body-l text-ink">Applied</p>
        <p className="text-body-s text-ink-muted">{appliedSummary}</p>
        <div>
          <Button variant="secondary" onClick={() => router.push("/announcements")}>
            Back to Announcements
          </Button>
        </div>
      </Panel>
    );
  }

  if (announcement.status !== "parsed") {
    return (
      <div className="flex flex-col gap-4">
        <Panel className="flex flex-col gap-3">
          <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
            {STATUS_LABEL[announcement.status] ?? announcement.status}
          </p>
          <p className="text-body text-ink">{announcement.raw_text}</p>
          {announcement.status === "failed" && announcement.failure_reason != null ? (
            <p className="text-body-s text-risk-critical">{announcement.failure_reason}</p>
          ) : null}
        </Panel>
        {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}
        {announcement.status === "pending" || announcement.status === "failed" ? (
          <div>
            <Button onClick={handleReparse} loading={reparseBusy} disabled={isPending}>
              {announcement.status === "failed" ? "Retry parse" : "Parse now"}
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
        Proposed changes — nothing applies until you confirm
      </p>

      {changes.map((change, index) => (
        <Panel key={index} className="flex flex-col gap-3">
          {change.kind === "date_change" ? (
            <>
              <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Date change</p>
              <Select
                label="Item"
                options={titles.map((t) => ({ value: t, label: t }))}
                value={change.matchedTitle}
                onValueChange={(v) => patchChange(index, { matchedTitle: v })}
              />
              <DatePicker
                label={change.newDueDate == null ? `New date — unresolved: "${change.newDueText ?? "?"}"` : "New date"}
                value={change.newDueDate}
                onValueChange={(v) => patchChange(index, { newDueDate: v })}
                {...(change.newDueDate == null ? { error: "Pick a real date; the server won't guess." } : {})}
              />
            </>
          ) : change.kind === "new_item" ? (
            <>
              <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
                New {change.itemType.replace(/_/g, " ")}
              </p>
              <p className="text-body-l text-ink">{change.title}</p>
              <DatePicker
                label={change.dueDate == null ? `Due — unresolved: "${change.dueText ?? "?"}"` : "Due"}
                value={change.dueDate}
                onValueChange={(v) => patchChange(index, { dueDate: v })}
                {...(change.dueDate == null ? { error: "Pick a real date; the server won't guess." } : {})}
              />
            </>
          ) : (
            <>
              <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Note — no schedule change</p>
              <p className="text-body text-ink">{change.text}</p>
            </>
          )}
          <p className="border-l-2 border-hairline pl-3 font-mono text-caption text-ink-faint">&ldquo;{change.sourceSnippet}&rdquo;</p>
        </Panel>
      ))}

      {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => handleDecision("confirm")} loading={isPending}>
          {edited ? "Apply edited changes" : "Apply changes"}
        </Button>
        <Button variant="secondary" onClick={() => handleDecision("reject")} disabled={isPending}>
          Reject
        </Button>
      </div>
    </div>
  );
}
