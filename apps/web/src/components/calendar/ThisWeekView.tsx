"use client";

import { useState, useTransition } from "react";
import type { WeeklyPlanBlockStatus, WeeklyPlanBlockView, WeeklyPlanView } from "@collegeos/api";
import { Badge, ChipGroup, EmptyState, Panel, RiskPill } from "@/components/ui";
import { daysRemainingLabel } from "@/lib/dates";
import { generateThisWeekPlanAction, updateWeeklyPlanBlockStatusAction } from "@/app/(app)/calendar/actions";

const STATUS_OPTIONS = [
  { value: "confirmed", label: "Confirm" },
  { value: "skipped", label: "Skip" },
  { value: "completed", label: "Complete" },
];

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatBlockRange(startAt: string, endAt: string, timeZone: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone }).format(start);
  const fmt = (d: Date) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(d);
  const startStr = fmt(start);
  const endStr = fmt(end);
  const samePeriod = startStr.slice(-2) === endStr.slice(-2);
  return `${weekday} ${samePeriod ? startStr.slice(0, -3) : startStr}–${endStr}`;
}

function UnplacedDisclosure({ unplaced }: { unplaced: WeeklyPlanView["unplaced"] }) {
  if (unplaced.length === 0) return null;
  return (
    <Panel tone="sunken" className="flex flex-col gap-2">
      <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-high">
        Didn&apos;t fit this week ({unplaced.length})
      </p>
      <ul className="flex flex-col gap-1">
        {unplaced.map((u) => (
          <li key={u.id} className="text-body-s text-ink-muted">
            {u.title ?? "Untitled"}
            {u.courseCode ? <span className="text-ink-faint"> · {u.courseCode}</span> : null} —{" "}
            {u.reason === "due_before_window" ? "due before this week starts" : `${formatMinutes(u.minutesShortfall)} short of capacity`}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function BlockRow({ block, timezone }: { block: WeeklyPlanBlockView; timezone: string }) {
  const [status, setStatus] = useState<WeeklyPlanBlockStatus>(block.status);
  const [failed, setFailed] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleChange(value: string) {
    const next = value as WeeklyPlanBlockStatus;
    const prev = status;
    setStatus(next);
    setFailed(false);
    startTransition(async () => {
      const result = await updateWeeklyPlanBlockStatusAction(block.id, next);
      if (!result.ok) {
        setStatus(prev);
        setFailed(true);
      }
    });
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline py-3 last:border-b-0">
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-body-s tabular-nums text-ink">{formatBlockRange(block.startAt, block.endAt, timezone)}</span>
        <span className="text-body-s text-ink-muted">
          {block.title ?? "Untitled"}
          {block.courseCode ? <span className="text-ink-faint"> · {block.courseCode}</span> : null}
          <span className="text-ink-faint"> · {formatMinutes(block.minutes)}</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <ChipGroup
          label="Status"
          options={STATUS_OPTIONS}
          value={status === "suggested" ? null : status}
          onChange={handleChange}
          disabled={isPending}
        />
        {failed ? <span className="text-caption text-risk-critical">Couldn&apos;t save — try again.</span> : null}
      </div>
    </li>
  );
}

export function ThisWeekView({ today, timezone, plan }: { today: string; timezone: string; plan: WeeklyPlanView | null }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const result = await generateThisWeekPlanAction();
      if (!result.ok) setError(result.error ?? "Couldn't generate a plan — try again.");
    });
  }

  if (!plan) {
    return (
      <EmptyState
        title="No plan for this week yet"
        description="Generate a plan from your calendar availability, deadlines, and course risk -- deep-work blocks suggested and ranked, nothing hidden."
        actionLabel={isPending ? "Generating…" : "Generate this week's plan"}
        onAction={handleGenerate}
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        <Badge tone="accent">Academic load: {plan.academicLoad.toUpperCase()}</Badge>
        <span className="font-mono text-body-s tabular-nums text-ink-faint">
          {formatMinutes(plan.totalNeededMinutes)} needed of {formatMinutes(plan.totalCapacityMinutes)} available
        </span>
      </div>

      {plan.highestRisk.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Highest risk</h2>
          <Panel>
            <ol className="flex flex-col gap-1">
              {plan.highestRisk.map((r, i) => (
                <li key={r.deliverableId} className="flex items-center gap-2 text-body-s text-ink">
                  <span className="font-mono text-ink-faint">{i + 1}.</span>
                  <span className="text-ink-faint">{r.courseCode}</span>
                  <span>{r.title}</span>
                  <span className="text-ink-faint">— {daysRemainingLabel(today, r.dueDate)}</span>
                  <RiskPill band={r.riskBand} label={r.riskBand.toUpperCase()} />
                </li>
              ))}
            </ol>
          </Panel>
        </section>
      ) : null}

      {plan.courseAllocations.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Recommended deep-work allocation</h2>
          <Panel>
            <ul className="flex flex-wrap gap-4">
              {plan.courseAllocations.map((a) => (
                <li key={a.courseId} className="font-mono text-body-s tabular-nums text-ink">
                  {a.courseCode} <span className="text-ink-faint">{formatMinutes(a.minutesAllocated)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Suggested focus blocks</h2>
        {plan.blocks.length === 0 ? (
          <p className="text-body-s text-ink-faint">Nothing placed this week.</p>
        ) : (
          <Panel>
            <ul className="flex flex-col">
              {plan.blocks.map((block) => (
                <BlockRow key={block.id} block={block} timezone={timezone} />
              ))}
            </ul>
          </Panel>
        )}
      </section>

      <UnplacedDisclosure unplaced={plan.unplaced} />
    </div>
  );
}
