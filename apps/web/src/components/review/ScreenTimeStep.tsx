"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ScreenTimeExtractionRow, ScreenTimeStepView } from "@collegeos/api";
import { unresolvedFields, type WeekPoint } from "@collegeos/core";
import { Button, EmptyState, Input, Panel } from "@/components/ui";
import { confirmScreenTimeAction, uploadScreenTimeAction } from "@/app/(app)/review/screenTimeActions";

/**
 * The Sunday review's screen-time step (D51): upload the week's Screen Time screenshot, read it,
 * fill in whatever the model could not, confirm.
 *
 * Four rules, and each one is a thing a well-meaning redesign would break:
 *
 * 1. **The offer is an INVITATION, never a nag.** When the week is outstanding this renders one
 *    panel with one sentence and one control. There is no badge, no counter, no "3 weeks missed",
 *    no red dot, and nothing escalates if it is ignored — because there is nothing to escalate to.
 *    The copy says so out loud: skipping a week leaves a gap, and nothing breaks.
 *
 * 2. **A missed week is a GAP.** The series below renders an unreported week as a visible hole
 *    with the words "not reported" on it. Never a zero, never a line drawn straight across it, and
 *    nowhere in this file is there a count of consecutive weeks.
 *
 * 3. **No guessing (D10).** A value the model could not read arrives as an empty field. Confirming
 *    is blocked until every one is filled, and the block is expressed by MARKING THE FIELDS and
 *    disabling the button — not by letting someone press Confirm and telling them off.
 *
 * 4. **Nothing here is shared.** C9 holds; there is no share control and no design toward one.
 */
export interface ScreenTimeStepProps {
  view: ScreenTimeStepView;
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatWeek(weekStart: string): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  if (y == null || m == null || d == null) return weekStart;
  // Parsed as a local wall-clock date. `new Date("2026-08-30")` reads as UTC midnight and renders
  // the previous day west of Greenwich (B4).
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ScreenTimeStep({ view }: ScreenTimeStepProps) {
  return (
    <div className="flex flex-col gap-6">
      <ScreenTimeUpload view={view} />
      <WeeklySeries points={view.series.points} summary={view.series.summary} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload -> parse -> confirm
// ---------------------------------------------------------------------------

function ScreenTimeUpload({ view }: { view: ScreenTimeStepView }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [staged, setStaged] = useState<ScreenTimeExtractionRow[]>(view.staged);
  const [uploadId, setUploadId] = useState<number | null>(view.upload?.id ?? null);

  function handleUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setMessage("Choose a PNG or JPEG screenshot first.");
      return;
    }
    const formData = new FormData();
    formData.set("file", file);
    setMessage(undefined);
    startTransition(async () => {
      try {
        const result = await uploadScreenTimeAction(formData, view.weekStart);
        if (!result.ok) {
          setMessage(result.error);
          return;
        }
        setUploadId(result.uploadId);
        if (!result.parse.ok) {
          // Honest and explicit: the file is stored, only the reading could not run. The server's
          // own words, relayed rather than papered over with "try again".
          setMessage(`The screenshot saved, but reading it didn't run: ${result.parse.error}`);
          return;
        }
        setStaged(result.parse.items);
      } catch (err) {
        setMessage(
          `Couldn't reach the server to read that screenshot (${err instanceof Error ? err.message : "unknown error"}).`,
        );
      }
    });
  }

  if (!view.outstanding && staged.length === 0) {
    const latest = view.series.summary.latest;
    return (
      <Panel className="flex flex-col gap-2">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">This week is in</p>
        <p className="text-body text-ink-muted">
          {latest?.minutes != null
            ? `${formatMinutes(latest.minutes)} a day, confirmed.`
            : "Confirmed."}{" "}
          Re-upload if you want to correct the reading.
        </p>
        <UploadControl
          fileInputRef={fileInputRef}
          onUpload={handleUpload}
          isPending={isPending}
          label="Re-upload"
        />
        {message ? <p className="text-body-s text-ink-muted">{message}</p> : null}
      </Panel>
    );
  }

  if (staged.length > 0 && uploadId != null) {
    return (
      <ConfirmStaged
        uploadId={uploadId}
        staged={staged}
        onConfirmed={() => {
          setStaged([]);
          router.refresh();
        }}
      />
    );
  }

  return (
    <Panel className="flex flex-col gap-3">
      <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
        This week&apos;s screen time
      </p>
      {/* THE INVITATION. One sentence, one control, and an explicit statement that skipping costs
          nothing — because that sentence is what keeps this from becoming a chore (D51). */}
      <p className="text-body text-ink-muted">
        Open Settings → Screen Time, screenshot the week, and add it here when you want to look.
        Skipping a week just leaves a gap in the series — nothing breaks.
      </p>
      <UploadControl
        fileInputRef={fileInputRef}
        onUpload={handleUpload}
        isPending={isPending}
        label="Add the screenshot"
      />
      {message ? <p className="text-body-s text-ink-muted">{message}</p> : null}
    </Panel>
  );
}

function UploadControl({
  fileInputRef,
  onUpload,
  isPending,
  label,
}: {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onUpload: () => void;
  isPending: boolean;
  label: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg"
        aria-label="Screen Time screenshot"
        className="text-body-s text-ink"
        disabled={isPending}
      />
      <Button variant="secondary" onClick={onUpload} loading={isPending} disabled={isPending}>
        {label}
      </Button>
    </div>
  );
}

function itemLabel(row: ScreenTimeExtractionRow): string {
  if (row.item_type === "total") return row.label ?? "Daily average";
  return row.label ?? "Unnamed";
}

/**
 * The confirm step. Every staged row is a field; the ones the model could not read are empty and
 * marked, and the button stays disabled until they are filled.
 *
 * `unresolvedFields` from `packages/core` decides what still blocks — the same function the data
 * layer runs server-side before it writes anything, so the button and the write agree by
 * construction rather than by two copies of the same rule.
 */
function ConfirmStaged({
  uploadId,
  staged,
  onConfirmed,
}: {
  uploadId: number;
  staged: ScreenTimeExtractionRow[];
  onConfirmed: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>(undefined);
  const [drafts, setDrafts] = useState<Record<number, string>>(() =>
    Object.fromEntries(staged.map((row) => [row.id, row.minutes == null ? "" : String(row.minutes)])),
  );

  const values = staged.map((row) => {
    const raw = (drafts[row.id] ?? "").trim();
    const parsed = raw === "" ? null : Number(raw);
    const minutes = parsed != null && Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
    return { row, minutes, staged: { label: row.label, minutes, needsInput: minutes == null } };
  });

  const outstanding = new Set(
    unresolvedFields(values.map((v) => v.staged)).map(
      (value) => values.find((v) => v.staged === value)!.row.id,
    ),
  );

  function handleConfirm() {
    setError(undefined);
    startTransition(async () => {
      const result = await confirmScreenTimeAction(
        uploadId,
        values.map((v) => ({ extractionId: v.row.id, minutes: v.minutes, label: v.row.label })),
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.data.kind === "blocked") {
        // Belt and braces: the button is already disabled in this state. If the two ever disagree
        // the server wins, and it still names fields rather than scolding.
        setError(undefined);
        return;
      }
      onConfirmed();
    });
  }

  const outstandingLabels = values.filter((v) => outstanding.has(v.row.id)).map((v) => itemLabel(v.row));

  return (
    <Panel className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
          Check the reading
        </p>
        <p className="text-body-s text-ink-muted">
          Nothing is recorded until you confirm. Numbers are in minutes.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {values.map(({ row }) => {
          const stillOpen = outstanding.has(row.id);
          return (
            <li
              key={row.id}
              // The marker is a rule on the row, not a recoloured input border: a red field would
              // read as "you got this wrong", and nobody did anything wrong -- the screenshot was
              // just unreadable there. It clears the moment a value is typed.
              className={
                "glass-sunken flex flex-col gap-1 rounded-md p-3 " +
                (stillOpen ? "border-l-2 border-l-accent" : "")
              }
            >
              <Input
                label={`${itemLabel(row)}${row.item_type === "total" ? " (daily average)" : ""}`}
                value={drafts[row.id] ?? ""}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))}
                inputMode="numeric"
                placeholder="minutes"
                disabled={isPending}
              />
              {stillOpen && row.needs_input ? (
                // The no-guessing rule, said in the user's language. The field is empty because
                // nobody could read it — not because something went wrong.
                <span className="text-caption text-accent">
                  Couldn&apos;t read this one — type what the screenshot says.
                </span>
              ) : row.source_snippet != null ? (
                <span className="font-mono text-caption text-ink-faint">
                  Read as &ldquo;{row.source_snippet}&rdquo;
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}

      <div className="flex flex-col gap-2">
        <div>
          <Button onClick={handleConfirm} disabled={isPending || outstanding.size > 0} loading={isPending}>
            Confirm the week
          </Button>
        </div>
        {/* Points at the fields rather than refusing with a message. Named, so a value scrolled
            off the top is still findable. */}
        {outstanding.size > 0 ? (
          <p className="text-caption text-ink-faint">Still to fill in: {outstandingLabels.join(", ")}</p>
        ) : null}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// The confirmed series
// ---------------------------------------------------------------------------

/**
 * The weekly series, gaps and all.
 *
 * A week with no confirmed upload is drawn as an EMPTY SLOT with a hairline outline and the words
 * "not reported" in its label — never a zero-height bar, never a line interpolated across it.
 * D51's rule made visual: the app does not know what happened that week and must not draw a claim
 * that it does. Nothing here counts weeks in a row.
 */
function WeeklySeries({
  points,
  summary,
}: {
  points: WeekPoint[];
  summary: ScreenTimeStepView["series"]["summary"];
}) {
  if (summary.reportedWeeks === 0) {
    return (
      <EmptyState
        title="No weeks reported yet"
        description="Confirm one screenshot and the series starts. It reads alongside your Hours — a second measure of where the week actually went."
      />
    );
  }

  const peak = Math.max(...points.map((p) => p.minutes ?? 0), 1);

  return (
    <Panel className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Weekly daily average</p>
        {/* The average is over REPORTED weeks only, so it is quoted with its own denominator --
            an average that silently spanned the gaps would be a different number than it claims.
            Deliberately not "4 of 12": a coverage score is one step from a consistency verdict. */}
        {summary.averageMinutes != null ? (
          <p className="font-mono text-label tabular-nums text-ink-faint">
            {formatMinutes(summary.averageMinutes)} avg over {summary.reportedWeeks} reported{" "}
            {summary.reportedWeeks === 1 ? "week" : "weeks"}
          </p>
        ) : null}
      </div>

      <ul className="flex items-end gap-1.5" style={{ height: 96 }}>
        {points.map((point) => {
          const reported = point.minutes != null;
          return (
            <li
              key={point.weekStartDate}
              className="flex h-full flex-1 flex-col justify-end"
              title={
                reported
                  ? `Week of ${formatWeek(point.weekStartDate)}: ${formatMinutes(point.minutes!)} a day`
                  : `Week of ${formatWeek(point.weekStartDate)}: not reported`
              }
              aria-label={
                reported
                  ? `Week of ${formatWeek(point.weekStartDate)}, ${formatMinutes(point.minutes!)} a day`
                  : `Week of ${formatWeek(point.weekStartDate)}, not reported`
              }
            >
              {reported ? (
                <div
                  className="w-full rounded-sm bg-accent"
                  style={{ height: `${Math.max(4, Math.round((point.minutes! / peak) * 100))}%` }}
                />
              ) : (
                // The hole. An outlined empty slot, not a zero-height bar -- a zero would be a
                // claim about a week nobody reported.
                <div className="h-full w-full rounded-sm border border-dashed border-hairline" />
              )}
            </li>
          );
        })}
      </ul>

      {/* The legend, and nothing beyond it. Saying "not a streak" would still be saying
          something about streaks, which D51 rules out along with the streak itself. */}
      <p className="text-caption text-ink-faint">An outlined week is one you didn&apos;t report.</p>

      {summary.deltaMinutes != null ? (
        <p className="font-mono text-caption tabular-nums text-ink-faint">
          {summary.deltaMinutes === 0
            ? "Level with the previous reported week."
            : `${summary.deltaMinutes > 0 ? "+" : "−"}${formatMinutes(Math.abs(summary.deltaMinutes))} a day against the previous reported week.`}
        </p>
      ) : null}
    </Panel>
  );
}
