"use client";

import type { TaskSession } from "@collegeos/api";
import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import { toggleTaskCompletion } from "@/app/(app)/today/actions";
import { MitList, type MitItem } from "./MitList";

interface MitFocusContextValue {
  /** `initialItems` with `completed` overridden by this provider's own live state -- never a
   *  server refetch, so a completed item never vanishes out from under the user the way it
   *  would if this re-read a live-reranked "what's still outstanding" list (rankSuggestedMits
   *  drops a task the moment it's done; Top 3 is a checklist of what was chosen, not a leaderboard
   *  that reshuffles as you go). */
  items: MitItem[];
  failedIds: Set<number>;
  isPending: boolean;
  toggle: (taskId: number, checked: boolean) => void;
}

const MitFocusContext = createContext<MitFocusContextValue | null>(null);

export function MitFocusProvider({ initialItems, children }: { initialItems: MitItem[]; children: ReactNode }) {
  const [completedIds, setCompletedIds] = useState<Set<number>>(
    () => new Set(initialItems.filter((i) => i.completed).map((i) => i.taskId)),
  );
  const [failedIds, setFailedIds] = useState<Set<number>>(new Set());
  const [isPending, startTransition] = useTransition();

  function toggle(taskId: number, checked: boolean) {
    setCompletedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(taskId);
      else next.delete(taskId);
      return next;
    });
    setFailedIds((prev) => {
      const next = new Set(prev);
      next.delete(taskId);
      return next;
    });

    startTransition(async () => {
      const result = await toggleTaskCompletion(taskId, checked ? "completed" : "pending");
      if (!result.ok) {
        setCompletedIds((prev) => {
          const next = new Set(prev);
          if (checked) next.delete(taskId);
          else next.add(taskId);
          return next;
        });
        setFailedIds((prev) => new Set(prev).add(taskId));
      }
    });
  }

  const items = initialItems.map((item) => ({ ...item, completed: completedIds.has(item.taskId) }));

  return (
    <MitFocusContext.Provider value={{ items, failedIds, isPending, toggle }}>{children}</MitFocusContext.Provider>
  );
}

function useMitFocus(): MitFocusContextValue {
  const ctx = useContext(MitFocusContext);
  if (!ctx) throw new Error("useMitFocus must be used within MitFocusProvider");
  return ctx;
}

/** The Top 3 list, wired to the same state the headline reads -- see MitFocusProvider above. */
export function ConnectedMitList({ taskSessions }: { taskSessions: readonly TaskSession[] }) {
  const { items, failedIds, isPending, toggle } = useMitFocus();
  return <MitList items={items} onToggle={toggle} failedIds={failedIds} isPending={isPending} taskSessions={taskSessions} />;
}

interface TodayHeadlineText {
  eyebrow: string;
  headline: string;
  supporting: string | null;
}

/**
 * DESIGN_LANGUAGE_V2 §8, ratified cross-platform: the headline names the top outstanding MIT
 * ("what do I do now" is the first question, and a name answers it where a count doesn't). The
 * progress count survives as the supporting line ("am I on track" is the second question). All
 * done collapses to the count as the headline, since there's no next thing left to name.
 */
function buildHeadlineText(items: MitItem[]): TodayHeadlineText | null {
  const total = items.length;
  if (total === 0) return null;
  const done = items.filter((m) => m.completed).length;
  const noun = total === 1 ? "priority" : "priorities";
  if (done === total) {
    return { eyebrow: "Today's focus", headline: `All ${total} ${noun} done`, supporting: null };
  }
  const next = items.find((m) => !m.completed);
  return {
    eyebrow: "Today's focus",
    // `next` always exists here (done < total guarantees an outstanding item); the fallback
    // only guards the type, it isn't a reachable branch.
    headline: next?.title ?? `${total - done} ${noun} to go today`,
    supporting: `${done} of ${total} priorities done`,
  };
}

/** The page's §8 lead statement -- reads the exact same live items as ConnectedMitList, so the
 *  two most prominent things on the screen can never name a different task or a different count.
 *
 *  `fallbackHeadline`: Recovery mode's kept set is exactly analogous to normal mode's Top 3 --
 *  it *is* the one thing the user is meant to do today, arguably more so, since a struggling
 *  user is precisely who needs to be told the one thing rather than a mode label. So Recovery
 *  goes through this same component with `recoveryMitItems` as its provider's items; the only
 *  difference is what to say when there's nothing to name -- normal mode says nothing (there
 *  genuinely is no MIT yet), Recovery says "Recovery day" (the mode is still real information
 *  when the kept set is empty). Ratified cross-platform, matching mobile's computeHeadline. */
export function TodayFocusHeadline({ fallbackHeadline }: { fallbackHeadline?: string } = {}) {
  const { items } = useMitFocus();
  const text = buildHeadlineText(items) ?? (fallbackHeadline ? { eyebrow: "Today's focus", headline: fallbackHeadline, supporting: null } : null);
  if (!text) return null;

  return (
    <div className="flex flex-col gap-1">
      <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-faint">{text.eyebrow}</p>
      <h1 className="font-sans text-display-l font-semibold tracking-[-0.025em] text-ink">{text.headline}</h1>
      {text.supporting ? <p className="font-mono text-body-s tabular-nums text-ink-muted">{text.supporting}</p> : null}
    </div>
  );
}
