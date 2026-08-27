"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DistractionCause, DistractionRow, TaskSessionRow } from "@collegeos/api";
import { Button, Input, Panel } from "@/components/ui";
import { endHourAction, logDistractionAction, startHourAction } from "@/app/(app)/hour/hourActions";

const CAUSES: { value: DistractionCause; label: string }[] = [
  { value: "phone", label: "Phone" },
  { value: "notification", label: "Notification" },
  { value: "reflex", label: "Reflex" },
  { value: "got_hard", label: "Got hard" },
  { value: "bored", label: "Bored" },
  { value: "finished_early", label: "Finished early" },
];

export interface HourClientProps {
  activeHour: TaskSessionRow | null;
  distractions: DistractionRow[];
}

function formatClock(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function HourClient({ activeHour, distractions }: HourClientProps) {
  const router = useRouter();
  const [deliverable, setDeliverable] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  // Distraction count is optimistic on top of the server's list so a tap reads instantly;
  // the server list is the truth and drops the optimistic delta the moment it arrives.
  // Adjusted during render rather than in an effect: resetting derived state from a prop
  // change in useEffect renders the stale value first and then immediately re-renders,
  // which is the cascading-render pattern React explicitly warns against.
  const [optimisticExtra, setOptimisticExtra] = useState(0);
  const [seenServerCount, setSeenServerCount] = useState(distractions.length);
  if (seenServerCount !== distractions.length) {
    setSeenServerCount(distractions.length);
    setOptimisticExtra(0);
  }

  const startedAtMs = activeHour?.actual_start != null ? Date.parse(activeHour.actual_start) : null;
  const plannedSeconds = (activeHour?.planned_duration_min ?? 60) * 60;

  // `now` exists only to force a re-render each second. Elapsed time is always derived
  // from the stored actual_start against the current wall clock, never accumulated in a
  // counter — so a backgrounded tab, a sleeping laptop or a re-mount cannot drift it.
  const [now, setNow] = useState(() => Date.now());
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (startedAtMs == null) return;
    tickRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (tickRef.current != null) clearInterval(tickRef.current);
      tickRef.current = null;
    };
  }, [startedAtMs]);

  const elapsedSeconds = startedAtMs != null ? Math.floor((now - startedAtMs) / 1000) : 0;
  const remaining = plannedSeconds - elapsedSeconds;
  const isOvertime = remaining < 0;
  const interruptions = distractions.length + optimisticExtra;

  const causeTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const d of distractions) totals.set(d.cause, (totals.get(d.cause) ?? 0) + 1);
    return totals;
  }, [distractions]);

  function handleStart() {
    setError(undefined);
    if (deliverable.trim().length === 0) {
      setError("Name the one thing this Hour produces.");
      return;
    }
    startTransition(async () => {
      const result = await startHourAction({
        deliverable,
        ...(category.trim().length > 0 ? { category: category.trim() } : {}),
      });
      if (!result.ok) {
        setError(result.error ?? "Couldn't start the Hour.");
        return;
      }
      setDeliverable("");
      setCategory("");
      router.refresh();
    });
  }

  function handleDistraction(cause: DistractionCause) {
    if (activeHour == null) return;
    setError(undefined);
    setOptimisticExtra((n) => n + 1);
    startTransition(async () => {
      const result = await logDistractionAction(activeHour.id, cause);
      if (!result.ok) {
        setOptimisticExtra((n) => Math.max(0, n - 1));
        setError(result.error ?? "Couldn't log that.");
        return;
      }
      router.refresh();
    });
  }

  function handleEnd(outcome: "completed" | "abandoned") {
    if (activeHour == null) return;
    setError(undefined);
    startTransition(async () => {
      const result = await endHourAction(activeHour.id, outcome);
      if (!result.ok) {
        setError(result.error ?? "Couldn't end the Hour.");
        return;
      }
      router.refresh();
    });
  }

  if (activeHour == null) {
    return (
      <div className="flex flex-col gap-6">
        <Panel className="flex flex-col gap-4">
          <p className="text-body text-ink-muted">
            An Hour is one block with one output. Name the thing it produces before you start — an Hour
            without a deliverable is just elapsed time.
          </p>
          <Input
            label="What does this Hour produce?"
            value={deliverable}
            onChange={(e) => setDeliverable(e.target.value)}
            placeholder="Finish the stats problem set"
          />
          <Input
            label="Category (optional)"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="School"
          />
          {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}
          <div>
            <Button onClick={handleStart} loading={isPending}>
              Start the Hour
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel className="flex flex-col items-center gap-3 py-10">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
          Hour {activeHour.hour_index ?? "—"} · {activeHour.deliverable ?? "Untitled"}
        </p>
        <p
          className={`font-mono text-[4rem] leading-none tabular-nums ${isOvertime ? "text-risk-critical" : "text-ink"}`}
          aria-live="off"
        >
          {isOvertime ? `+${formatClock(-remaining)}` : formatClock(remaining)}
        </p>
        <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
          {isOvertime ? "Over the Hour" : `${formatClock(elapsedSeconds)} elapsed`}
        </p>
      </Panel>

      <Panel title="Log a distraction" className="flex flex-col gap-3">
        <p className="text-body-s text-ink-muted">
          Naming the cause is the whole point — the Sunday Review&apos;s Pareto only means something
          because the six causes are a closed set.
        </p>
        <div className="flex flex-wrap gap-2">
          {CAUSES.map((cause) => (
            <Button
              key={cause.value}
              variant="secondary"
              onClick={() => handleDistraction(cause.value)}
              disabled={isPending}
            >
              {cause.label}
              {causeTotals.get(cause.value) ? ` · ${causeTotals.get(cause.value)}` : ""}
            </Button>
          ))}
        </div>
        <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
          {interruptions} {interruptions === 1 ? "interruption" : "interruptions"} this Hour
        </p>
      </Panel>

      {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => handleEnd("completed")} loading={isPending}>
          Finish — put it on the Wall
        </Button>
        <Button variant="ghost" onClick={() => handleEnd("abandoned")} disabled={isPending}>
          Abandon
        </Button>
      </div>
      <p className="text-body-s text-ink-muted">
        An abandoned Hour does not appear on the Wall. That is deliberate: the Wall only ever grows,
        so it can never read as a list of your failures.
      </p>
    </div>
  );
}
