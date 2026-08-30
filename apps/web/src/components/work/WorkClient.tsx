"use client";

import type { WorkOverview, WorkTargetStatus, WorkTargetWithTasks } from "@collegeos/api";
import type { LocalDate } from "@collegeos/core";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createShiftAction,
  createTargetAction,
  createTargetTaskAction,
  deleteShiftAction,
  setTargetStatusAction,
  setTaskStatusAction,
} from "@/app/(app)/work/workActions";
import { Button, DatePicker, EmptyState, Input, Panel, Select } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { formatShortDate, formatTimeOfDay } from "@/lib/dates";

/**
 * Work's interaction layer. Mirrored section for section by apps/mobile/src/app/work.tsx; both
 * render `loadWorkOverview`.
 *
 * **Two shapes of shift, one week.** Migration 53 stores a shift as recurring-by-weekday XOR
 * dated, because the read is always "what am I working this week" and splitting them would
 * mean unioning two tables on every render. `loadWorkOverview` resolves both onto the same
 * Sun–Sat days; this component only labels which kind each one is, because "every Tuesday" and
 * "this Tuesday" are different commitments to the person reading them.
 *
 * **Blocking is free text on purpose.** LifeOS models it as a sentence rather than a dependency
 * graph, and that is right for a personal pipeline: the useful fact is "waiting on the manager
 * to reply", which no foreign key can hold.
 *
 * **D40.** Nothing is seeded. No targets and no shifts is what all three users see first, and
 * both read as an invitation with the form attached. An empty lane inside a real pipeline says
 * "nothing here", never a zero; a week with no shifts on a Tuesday says "nothing scheduled",
 * which is different from having entered no schedule at all — and the page distinguishes them.
 */

const LANES: { status: "active" | "blocked" | "done"; title: string; blurb: string }[] = [
  { status: "active", title: "Active", blurb: "Moving." },
  { status: "blocked", title: "Blocked", blurb: "Waiting on something outside you." },
  { status: "done", title: "Done", blurb: "Finished." },
];

const STATUS_OPTIONS: { value: WorkTargetStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
  { value: "dropped", label: "Dropped" },
];

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** ISO weekdays, 1 = Monday .. 7 = Sunday — the schema's single weekday convention. */
const ISO_WEEKDAY_OPTIONS = [
  { value: "1", label: "Every Monday" },
  { value: "2", label: "Every Tuesday" },
  { value: "3", label: "Every Wednesday" },
  { value: "4", label: "Every Thursday" },
  { value: "5", label: "Every Friday" },
  { value: "6", label: "Every Saturday" },
  { value: "7", label: "Every Sunday" },
];

type Run = (action: () => Promise<{ ok: boolean; error?: string }>, fallback: string, onDone?: () => void) => void;

function Chip({
  label,
  selected,
  disabled,
  onClick,
  role,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  role: "radio" | "toggle";
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      {...(role === "radio" ? { role: "radio", "aria-checked": selected } : { "aria-pressed": selected })}
      className={cn(
        "rounded-pill border px-3 py-1 font-sans text-body-s",
        "outline-none transition-colors duration-90",
        "focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2",
        selected
          ? "border-domain-work bg-domain-work/20 text-ink"
          : "border-border bg-surface text-ink-muted hover:bg-surface-sunken hover:text-ink",
        disabled && "cursor-not-allowed opacity-40",
      )}
    >
      {label}
    </button>
  );
}

export function WorkClient({ overview }: { overview: WorkOverview }) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  const run: Run = (action, fallback, onDone) => {
    setError(undefined);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? fallback);
        return;
      }
      onDone?.();
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}
      <PipelinePanel overview={overview} disabled={isPending} run={run} />
      <SchedulePanel overview={overview} disabled={isPending} run={run} />
    </div>
  );
}

function PipelinePanel({ overview, disabled, run }: { overview: WorkOverview; disabled: boolean; run: Run }) {
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState<string | null>(null);

  const total = LANES.reduce((acc, lane) => acc + overview.pipeline[lane.status].length, 0);

  const addForm = (
    <div className="flex flex-wrap items-end gap-3">
      <Input label="New target" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ship the intake form" />
      <DatePicker label="Deadline (optional)" value={deadline} onValueChange={setDeadline} />
      <Button
        variant="secondary"
        loading={disabled}
        onClick={() =>
          run(
            () => createTargetAction({ title, deadline: (deadline as LocalDate | null) ?? null }),
            "Could not add that target.",
            () => {
              setTitle("");
              setDeadline(null);
            },
          )
        }
      >
        Add target
      </Button>
    </div>
  );

  if (total === 0 && overview.droppedCount === 0) {
    return (
      <EmptyState
        title="Nothing in the pipeline"
        description="A target is one outcome you are working toward at your job — not a task, an outcome. Tasks go underneath it, and anything waiting on someone else moves to Blocked with a note saying who. Nothing is seeded here; the pipeline starts when you name the first one."
        action={addForm}
      />
    );
  }

  return (
    <Panel title="Pipeline" className="flex flex-col gap-6">
      {LANES.map((lane) => (
        <div key={lane.status} className="flex flex-col gap-3">
          <h4 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
            {lane.title} · {overview.pipeline[lane.status].length}
          </h4>
          {overview.pipeline[lane.status].length === 0 ? (
            <p className="text-body-s text-ink-faint">Nothing here. {lane.blurb}</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {overview.pipeline[lane.status].map((entry) => (
                <TargetRow
                  key={entry.target.id}
                  entry={entry}
                  today={overview.today}
                  disabled={disabled}
                  run={run}
                />
              ))}
            </ul>
          )}
        </div>
      ))}

      {overview.droppedCount > 0 ? (
        <p className="text-caption text-ink-faint">
          {/* Dropped is a real status and deliberately not a lane -- abandoned work does not
              get a column, but it is not made to disappear either. */}
          Plus <span className="font-mono tabular-nums">{overview.droppedCount}</span> dropped. They keep their record
          without taking up a lane.
        </p>
      ) : null}

      <div className="border-t border-hairline pt-4">{addForm}</div>
    </Panel>
  );
}

function TargetRow({
  entry,
  today,
  disabled,
  run,
}: {
  entry: WorkTargetWithTasks;
  today: LocalDate;
  disabled: boolean;
  run: Run;
}) {
  const [taskTitle, setTaskTitle] = useState("");
  const [reasonDrafts, setReasonDrafts] = useState<Record<number, string>>({});
  const { target, tasks } = entry;
  const openTasks = tasks.filter((t) => t.status !== "done" && t.status !== "dropped");

  return (
    <li className="flex flex-col gap-3 border-t border-hairline pt-4 first:border-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-body-l text-ink">{target.title}</span>
        <span className="font-mono text-body-s tabular-nums text-ink-muted">
          {target.deadline == null ? "No deadline" : formatShortDate(target.deadline as LocalDate)}
        </span>
      </div>

      <div role="radiogroup" aria-label={`${target.title} status`} className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            role="radio"
            label={option.label}
            selected={target.status === option.value}
            disabled={disabled}
            onClick={() => run(() => setTargetStatusAction(target.id, option.value), "Could not move that target.")}
          />
        ))}
      </div>

      {tasks.length === 0 ? (
        <p className="text-body-s text-ink-faint">No tasks under this target yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {tasks.map((task) => (
            <li key={task.id} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className={cn("text-body-s", task.status === "done" ? "text-ink-faint" : "text-ink")}>
                  {task.title}
                </span>
                {task.deadline != null ? (
                  <span className="font-mono text-caption tabular-nums text-ink-muted">
                    {formatShortDate(task.deadline as LocalDate)}
                  </span>
                ) : null}
              </div>
              {task.status === "blocked" ? (
                <p className="text-caption text-ink-muted">
                  {task.blocked_reason == null || task.blocked_reason.trim() === ""
                    ? "Blocked — no reason written down yet."
                    : `Waiting on: ${task.blocked_reason}`}
                </p>
              ) : null}
              <div role="radiogroup" aria-label={`${task.title} status`} className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map((option) => (
                  <Chip
                    key={option.value}
                    role="radio"
                    label={option.label}
                    selected={task.status === option.value}
                    disabled={disabled}
                    onClick={() =>
                      run(
                        () => setTaskStatusAction(task.id, option.value, reasonDrafts[task.id] ?? task.blocked_reason),
                        "Could not move that task.",
                      )
                    }
                  />
                ))}
              </div>
              {task.status === "blocked" ? (
                <div className="flex flex-wrap items-end gap-2">
                  <Input
                    label="Waiting on"
                    value={reasonDrafts[task.id] ?? task.blocked_reason ?? ""}
                    onChange={(e) => setReasonDrafts((current) => ({ ...current, [task.id]: e.target.value }))}
                    placeholder="A reply from payroll"
                  />
                  <Button
                    variant="secondary"
                    loading={disabled}
                    onClick={() =>
                      run(
                        () => setTaskStatusAction(task.id, "blocked", reasonDrafts[task.id] ?? task.blocked_reason),
                        "Could not save that.",
                      )
                    }
                  >
                    Save reason
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <Input label="Add a task" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Draft the copy" />
        <Button
          variant="secondary"
          loading={disabled}
          onClick={() =>
            run(
              () => createTargetTaskAction({ targetId: target.id, title: taskTitle, deadline: null }),
              "Could not add that task.",
              () => setTaskTitle(""),
            )
          }
        >
          Add
        </Button>
      </div>

      {target.status === "active" && openTasks.length === 0 && tasks.length > 0 ? (
        <p className="text-caption text-ink-faint">
          Every task under this one is finished — it may be time to mark the target done. Nothing does that for you.
        </p>
      ) : null}
      {target.deadline != null && target.status !== "done" ? (
        <p className="text-caption text-ink-faint">
          {target.deadline < today ? "The deadline has passed. It is still here, and still yours to move." : null}
        </p>
      ) : null}
    </li>
  );
}

function SchedulePanel({ overview, disabled, run }: { overview: WorkOverview; disabled: boolean; run: Run }) {
  const [mode, setMode] = useState<"recurring" | "one_off">("recurring");
  const [weekday, setWeekday] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [label, setLabel] = useState("");

  const addForm = (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Shift kind" className="flex flex-wrap gap-2">
        <Chip role="radio" label="Repeats weekly" selected={mode === "recurring"} disabled={disabled} onClick={() => setMode("recurring")} />
        <Chip role="radio" label="One-off" selected={mode === "one_off"} disabled={disabled} onClick={() => setMode("one_off")} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        {mode === "recurring" ? (
          <Select label="Weekday" value={weekday} onValueChange={setWeekday} placeholder="Pick one" options={ISO_WEEKDAY_OPTIONS} />
        ) : (
          <DatePicker label="Date" value={date} onValueChange={setDate} />
        )}
        <Input label="Starts" value={start} onChange={(e) => setStart(e.target.value)} placeholder="09:00" />
        <Input label="Ends" value={end} onChange={(e) => setEnd(e.target.value)} placeholder="17:00" />
        <Input label="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Front desk" />
      </div>
      <p className="text-caption text-ink-faint">
        Times go in as HH:MM on a 24-hour clock. An end before a start is an overnight shift, not a mistake.
      </p>
      <div>
        <Button
          variant="secondary"
          loading={disabled}
          onClick={() =>
            run(
              () =>
                createShiftAction({
                  weekday: mode === "recurring" && weekday != null ? Number(weekday) : null,
                  localDate: mode === "one_off" ? ((date as LocalDate | null) ?? null) : null,
                  startTime: start,
                  endTime: end,
                  label: label.trim() === "" ? null : label.trim(),
                }),
              "Could not add that shift.",
              () => {
                setLabel("");
              },
            )
          }
        >
          Add shift
        </Button>
      </div>
    </div>
  );

  if (!overview.hasAnyShift) {
    return (
      <EmptyState
        title="No schedule entered"
        description="Shifts either repeat on a weekday or land on one date. Add the ones that repeat first — they fill in every week from then on, and a one-off can always be added on top."
        action={addForm}
      />
    );
  }

  return (
    <Panel title="This week" className="flex flex-col gap-5">
      <p className="text-body-s text-ink-muted">
        {formatShortDate(overview.weekStart)} – {formatShortDate(overview.weekEnd)}
      </p>
      <ul className="flex flex-col gap-3">
        {overview.week.map((day, index) => (
          <li
            key={day.date}
            className={cn(
              "flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-hairline pt-3 first:border-0 first:pt-0",
              day.isToday && "text-ink",
            )}
          >
            <span
              className={cn(
                "w-24 shrink-0 font-mono text-label uppercase tracking-[0.1em]",
                day.isToday ? "text-domain-work" : "text-ink-faint",
              )}
            >
              {WEEKDAY_LABELS[index]} {formatShortDate(day.date)}
            </span>
            {day.shifts.length === 0 ? (
              <span className="text-body-s text-ink-faint">Nothing scheduled</span>
            ) : (
              <span className="flex flex-wrap gap-x-4 gap-y-1">
                {day.shifts.map(({ shift, recurring }) => (
                  <span key={shift.id} className="flex items-center gap-2">
                    <span className="font-mono text-body-s tabular-nums text-ink">
                      {formatTimeOfDay(shift.start_time)} – {formatTimeOfDay(shift.end_time)}
                    </span>
                    {shift.label ? <span className="text-body-s text-ink-muted">{shift.label}</span> : null}
                    <span className="font-mono text-caption uppercase tracking-[0.1em] text-ink-faint">
                      {recurring ? "weekly" : "one-off"}
                    </span>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => run(() => deleteShiftAction(shift.id), "Could not remove that shift.")}
                      className={cn(
                        "font-mono text-caption text-ink-faint underline underline-offset-2",
                        "outline-none hover:text-ink-muted",
                        "focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2",
                        disabled && "cursor-not-allowed opacity-40",
                      )}
                    >
                      Remove
                    </button>
                  </span>
                ))}
              </span>
            )}
          </li>
        ))}
      </ul>
      <div className="border-t border-hairline pt-4">{addForm}</div>
    </Panel>
  );
}
