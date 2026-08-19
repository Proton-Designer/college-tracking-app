"use client";

import type { Course, Task, TaskSessionRow } from "@collegeos/api";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { abandonFocus, completeFocus } from "@/app/focus/[sessionId]/actions";
import { Button, Panel, SegmentedControl, Textarea } from "@/components/ui";

function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * SCREEN_SPEC §8 — full-screen, deliberately sparse. No app-block/allow list: this
 * product has no real blocking capability, and showing one would imply enforcement that
 * isn't happening. Elapsed time is re-derived from `session.actual_start` every tick,
 * never accumulated in JS state — a backgrounded or reloaded tab still shows the correct
 * elapsed time on the very next render, not a counter that silently paused.
 */
export function FocusSessionView({ session, task, course }: { session: TaskSessionRow; task: Task; course: Course | null }) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [mode, setMode] = useState<"focusing" | "completing">("focusing");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [output, setOutput] = useState("");
  const [focusRating, setFocusRating] = useState<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const actualStart = session.actual_start ? new Date(session.actual_start).getTime() : now;
  const elapsedSeconds = Math.max(0, Math.floor((now - actualStart) / 1000));

  function handleAbandon() {
    setError(null);
    startTransition(async () => {
      const result = await abandonFocus(session.id);
      if (!result.ok) {
        setError(result.error ?? "Couldn't end that session — try again.");
        return;
      }
      router.push("/today");
    });
  }

  function handleComplete() {
    setError(null);
    startTransition(async () => {
      const result = await completeFocus(session.id, {
        ...(focusRating != null ? { subjectiveFocus: focusRating } : {}),
        ...(output.trim() ? { objectiveOutput: output.trim() } : {}),
      });
      if (!result.ok) {
        setError(result.error ?? "Couldn't end that session — try again.");
        return;
      }
      router.push("/today");
    });
  }

  if (mode === "completing") {
    return (
      <main className="mx-auto flex w-full max-w-report flex-1 flex-col justify-center gap-6 px-8 py-12">
        <h1 className="font-serif text-display-m font-semibold tracking-[-0.01em] text-ink">How did that go?</h1>
        <Panel className="flex flex-col gap-5">
          <Textarea label="Actual output" value={output} onChange={(e) => setOutput(e.target.value)} rows={2} />
          <SegmentedControl label="Focus" value={focusRating} onChange={setFocusRating} min={1} max={5} />
          {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}
          <Button variant="primary" loading={isPending} onClick={handleComplete}>
            Done
          </Button>
        </Panel>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-report flex-1 flex-col items-center justify-center gap-8 px-8 py-12">
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
          {course ? `${course.code} focus` : "Focus"}
        </p>
        <h1 className="font-serif text-display-m font-semibold tracking-[-0.01em] text-ink">{task.title}</h1>
        {session.location ? <p className="text-body-s text-ink-faint">{session.location}</p> : null}
      </div>

      <p className="font-mono text-metric-xl tabular-nums text-ink">{formatElapsed(elapsedSeconds)}</p>

      {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}

      <div className="flex flex-col items-center gap-3">
        <Button variant="primary" onClick={() => setMode("completing")}>
          End session
        </Button>
        <button
          type="button"
          onClick={handleAbandon}
          disabled={isPending}
          className="font-mono text-caption uppercase tracking-[0.08em] text-ink-faint underline underline-offset-2 hover:text-ink"
        >
          Abandon without reflecting
        </button>
      </div>
    </main>
  );
}
