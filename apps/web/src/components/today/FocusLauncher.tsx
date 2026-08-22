"use client";

import type { TaskSessionRow } from "@collegeos/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startFocus } from "@/app/(app)/today/actions";
import { Button, Panel } from "@/components/ui";
import { useToast } from "@/components/ui/ToastProvider";

export interface FocusBlock {
  taskId: number;
  title: string;
  courseCode: string | null;
  calibratedMinutes: number;
  location: string | null;
}

/**
 * SCREEN_SPEC §1.7 — "Start focus" with the pre-selected highest-value block
 * (dayView.suggestedMits[0], already ranked by risk reduction per calibrated minute).
 * No app-block/allow list shown: this product has no real blocking capability (that's
 * native Screen Time, out of scope), and implying enforcement that isn't happening would
 * be exactly the kind of dishonest UI this codebase refuses to ship elsewhere.
 */
export function FocusLauncher({ block, activeSession }: { block: FocusBlock | null; activeSession: TaskSessionRow | null }) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (activeSession) {
    return (
      <section className="flex flex-col gap-3 border-t border-hairline pt-6">
        <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Focus</h2>
        <Panel className="flex items-center justify-between gap-4">
          <span className="text-body text-ink">A focus session is already running.</span>
          <Link href={`/focus/${activeSession.id}`}>
            <Button variant="primary">Resume focus</Button>
          </Link>
        </Panel>
      </section>
    );
  }

  if (!block) return null;

  function handleStart() {
    if (!block) return;
    setError(null);
    startTransition(async () => {
      const result = await startFocus(block.taskId, block.calibratedMinutes, block.location ?? undefined);
      if (!result.ok || result.sessionId == null) {
        setError(result.error ?? "Couldn't start that session — try again.");
        toast.show(result.error ?? "Couldn't start that session — try again.", "error");
        return;
      }
      router.push(`/focus/${result.sessionId}`);
    });
  }

  return (
    <section className="flex flex-col gap-3 border-t border-hairline pt-6">
      <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Focus</h2>
      <Panel className="flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <span className="text-body text-ink">
            {block.title}
            {block.courseCode ? <span className="text-ink-faint"> · {block.courseCode}</span> : null}
          </span>
          <span className="font-mono text-caption tabular-nums text-ink-faint">{block.calibratedMinutes} min</span>
        </div>
        <Button variant="primary" loading={isPending} onClick={handleStart}>
          Start focus
        </Button>
      </Panel>
      {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}
    </section>
  );
}
