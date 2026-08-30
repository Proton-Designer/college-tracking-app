"use client";

import { BUSINESS_TASK_CATEGORY, type BusinessLens } from "@collegeos/api";
import type { LocalDate } from "@collegeos/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  setTaskCompletedAction,
  setWeeklyGoalAction,
  setWeeklyGoalDoneAction,
} from "@/app/(app)/business/businessActions";
import { Button, EmptyState, Input, Metric, Panel, Select, Textarea } from "@/components/ui";
import { buttonClassName } from "@/components/ui/buttonStyles";
import { cn } from "@/components/ui/cn";
import { formatShortDate } from "@/lib/dates";

/**
 * Business's interaction layer. Mirrored by apps/mobile/src/app/business.tsx.
 *
 * **This screen is a lens over four things it does not own** (directive rule 3.4): today's
 * MITs and the open task list come from `tasks`, the week's focus from `weekly_goals`, the
 * direction it steps down from is a War Map milestone, and the Hours are `task_sessions` rows
 * tagged `business`. Business has no store of its own and no page of its own state.
 *
 * **D37 is the ruling this screen exists to respect.** LifeOS has a kill list; we have MITs;
 * they are the same idea at the same cardinality and ours is enforced in the database
 * (`tasks.mit_rank` 1–3, partial unique per day). So the top panel *reads* `mit_rank`. There
 * is no "today's three" widget here, and adding one would give the app two sources of truth
 * about the same question.
 *
 * **How membership works, said out loud.** A task is in this lens when its category is
 * "business". That rule is stated in the empty state rather than left invisible, because a
 * lens whose membership is a secret looks broken rather than empty (D40).
 */
export function BusinessClient({ lens }: { lens: BusinessLens }) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>, fallback: string, onDone?: () => void) {
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
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}

      <Panel title="Today's MITs" className="flex flex-col gap-4">
        {lens.mits.length === 0 ? (
          <>
            <p className="text-body-s text-ink-muted">
              {lens.mitsTodayTotal === 0
                ? "No MITs are set for today yet. They are chosen in the morning check-in, three at most, ranked."
                : `Today's ${lens.mitsTodayTotal} ${lens.mitsTodayTotal === 1 ? "MIT is" : "MITs are"} in other domains. That is a real answer, not a gap.`}
            </p>
            <p className="text-caption text-ink-faint">
              {/* D37: this reads the MIT system. It never keeps a second list. */}
              This panel reads your day&apos;s MITs — the same three the morning check-in ranks. Business does not keep
              a separate list of three.
            </p>
            <div>
              <Link href="/today" className={buttonClassName("secondary")}>
                Go to Today
              </Link>
            </div>
          </>
        ) : (
          <ul className="flex flex-col gap-3">
            {lens.mits.map((task) => (
              <li key={task.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="flex items-baseline gap-3">
                  <span className="font-mono text-body-s tabular-nums text-domain-business">#{task.mit_rank}</span>
                  <span className={cn("text-body", task.status === "completed" ? "text-ink-faint line-through" : "text-ink")}>
                    {task.title}
                  </span>
                </span>
                <Button
                  variant="secondary"
                  loading={isPending}
                  onClick={() =>
                    run(
                      () => setTaskCompletedAction(task.id, task.status !== "completed"),
                      "Could not update that task.",
                    )
                  }
                >
                  {task.status === "completed" ? "Reopen" : "Done"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <WeeklyGoalPanel lens={lens} disabled={isPending} run={run} />

      <Panel title="Hours today" className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-8">
          <Metric label="Hours" value={lens.hoursToday.hours} />
          <Metric
            label="Logged"
            value={lens.hoursToday.minutes == null ? "—" : lens.hoursToday.minutes}
            {...(lens.hoursToday.minutes == null ? {} : { unit: "min" })}
          />
        </div>
        <p className="text-body-s text-ink-muted">
          {lens.hoursToday.hours === 0
            ? "No business Hour has been completed today. An Hour starts with a one-line deliverable, and only deep work counts toward this number."
            : "Completed sessions tagged business. Learn and anti-worry sessions are real sessions and are counted separately — they are not Hours."}
        </p>
        {lens.hoursToday.minutes == null && lens.hoursToday.hours > 0 ? (
          <p className="text-caption text-ink-faint">
            {/* Null, not zero: nobody wrote down a duration, which is not the same as no time. */}
            None of them recorded a duration, so there are no minutes to report — an em-dash rather than a zero.
          </p>
        ) : null}
        {lens.hoursToday.otherSessions > 0 ? (
          <p className="text-caption text-ink-faint">
            Plus <span className="font-mono tabular-nums">{lens.hoursToday.otherSessions}</span> shorter business{" "}
            {lens.hoursToday.otherSessions === 1 ? "session" : "sessions"} that do not count as Hours.
          </p>
        ) : null}
      </Panel>

      <Panel title="Open work" className="flex flex-col gap-4">
        {lens.openTasks.length === 0 ? (
          <EmptyState
            title="Nothing tagged business yet"
            description={`A task joins this lens when its category is "${BUSINESS_TASK_CATEGORY}". Tag one on Today or in Capture and it appears here — Business does not hold tasks of its own, it just looks at yours through one filter.`}
            action={
              <Link href="/today" className={buttonClassName("secondary")}>
                Go to Today
              </Link>
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {lens.openTasks.map((task) => (
              <li key={task.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="flex flex-wrap items-baseline gap-3">
                  <span className="text-body text-ink">{task.title}</span>
                  <span className="font-mono text-caption tabular-nums text-ink-muted">
                    {formatShortDate(task.planned_date as LocalDate)}
                  </span>
                  {task.mit_rank != null ? (
                    <span className="font-mono text-caption uppercase tracking-[0.1em] text-domain-business">
                      MIT #{task.mit_rank}
                    </span>
                  ) : null}
                </span>
                <Button
                  variant="secondary"
                  loading={isPending}
                  onClick={() => run(() => setTaskCompletedAction(task.id, true), "Could not update that task.")}
                >
                  Done
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

type Run = (action: () => Promise<{ ok: boolean; error?: string }>, fallback: string, onDone?: () => void) => void;

/** The "no link" choice in the War Map picker. See `goalOptions` for why it is not "". */
const NO_GOAL = "none";

/**
 * The week's focus, and its optional link up to a War Map milestone.
 *
 * D37 keeps both: `goals`/`milestones` is the store of direction (top-5, monthly),
 * `weekly_goals` is the cadence (per-domain, week-scoped). The link is nullable on purpose —
 * some weeks are honestly about something unplanned, and forcing a lineage would make the
 * surface unusable exactly on those weeks.
 */
function WeeklyGoalPanel({ lens, disabled, run }: { lens: BusinessLens; disabled: boolean; run: Run }) {
  const [headline, setHeadline] = useState(lens.weeklyGoal?.headline ?? "");
  const [milestones, setMilestones] = useState(lens.weeklyGoal?.milestones ?? "");
  const [goalId, setGoalId] = useState<string>(
    lens.weeklyGoal?.goal_id == null ? NO_GOAL : String(lens.weeklyGoal.goal_id),
  );

  // A sentinel rather than "": Select already reserves the empty string for its own hidden
  // placeholder option, and two options sharing a value is a select that cannot be reasoned
  // about. "Not linked" is a real, choosable answer here, not the absence of one.
  const goalOptions = [
    { value: NO_GOAL, label: "Not linked to a goal" },
    ...lens.warMapGoals.map((g) => ({ value: String(g.id), label: g.title })),
  ];

  const form = (
    <div className="flex flex-col gap-3">
      <Input
        label="This week, business is about"
        value={headline}
        onChange={(e) => setHeadline(e.target.value)}
        placeholder="Get the first three paying customers"
      />
      <Textarea
        label="Milestones (one per line)"
        value={milestones}
        onChange={(e) => setMilestones(e.target.value)}
        rows={3}
      />
      {lens.warMapGoals.length > 0 ? (
        <Select label="Steps down from" value={goalId} onValueChange={setGoalId} options={goalOptions} />
      ) : (
        <p className="text-caption text-ink-faint">
          No War Map goals yet. A week can stand on its own — the link is optional, and some weeks are honestly about
          something unplanned.
        </p>
      )}
      <div>
        <Button
          loading={disabled}
          onClick={() =>
            run(
              () =>
                setWeeklyGoalAction({
                  headline,
                  milestones: milestones.trim() === "" ? null : milestones,
                  goalId: goalId === NO_GOAL ? null : Number(goalId),
                }),
              "Could not save this week's focus.",
            )
          }
        >
          {lens.weeklyGoal == null ? "Set the week" : "Update the week"}
        </Button>
      </div>
    </div>
  );

  if (lens.weeklyGoal == null) {
    return (
      <EmptyState
        title="No focus set for this week"
        description="One sentence for what business is about this week. It is the cadence layer — the War Map holds the direction, and this is the week that steps toward it. Weeks without one are not failures; they are just unwritten."
        action={form}
      />
    );
  }

  const done = lens.weeklyGoal.completed_at != null;
  return (
    <Panel title="This week" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className={cn("text-body-l", done ? "text-ink-faint" : "text-ink")}>{lens.weeklyGoal.headline}</p>
        <Button
          variant="secondary"
          loading={disabled}
          onClick={() =>
            run(() => setWeeklyGoalDoneAction(lens.weeklyGoal!.id, !done), "Could not update this week.")
          }
        >
          {done ? "Reopen" : "Mark done"}
        </Button>
      </div>
      <p className="font-mono text-caption text-ink-faint">Week of {formatShortDate(lens.weekStart)}</p>

      {lens.weeklyGoal.milestones ? (
        <ul className="flex flex-col gap-1">
          {lens.weeklyGoal.milestones
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .map((line, index) => (
              <li key={index} className="text-body-s text-ink-muted">
                {line}
              </li>
            ))}
        </ul>
      ) : null}

      {lens.linkedGoal ? (
        <p className="text-body-s text-ink-muted">
          Steps down from <span className="text-ink">{lens.linkedGoal.title}</span>
          {lens.linkedMilestone ? (
            <>
              {" "}
              · this month: <span className="text-ink">{lens.linkedMilestone.title}</span>
            </>
          ) : (
            <span className="text-ink-faint"> · no milestone set for this month</span>
          )}
        </p>
      ) : (
        <p className="text-caption text-ink-faint">
          Not linked to a War Map goal. That is allowed — a week can be about something unplanned.
        </p>
      )}

      <div className="border-t border-hairline pt-4">{form}</div>
    </Panel>
  );
}
