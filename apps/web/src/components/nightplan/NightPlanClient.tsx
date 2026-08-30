"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { NightPlanItem } from "@collegeos/api";
import { Button, Input, Panel } from "@/components/ui";
import { saveNightPlanAction } from "@/app/(app)/nightplan/nightPlanActions";

interface DraftItem {
  /** Local-only key. Not a database id — these rows do not exist until the plan is saved. */
  key: number;
  title: string;
  rank: 1 | 2 | 3 | null;
  /** The M.O.M. this serves, when the user said so. Null is the default and stays legitimate. */
  momId: number | null;
}

export interface NightPlanClientProps {
  plannedDate: string;
  /** Titles already planned for tomorrow, so the dump starts from what exists rather than
   *  inviting the user to retype it. */
  existingTitles: string[];
  /**
   * The one thing an MIT can be said to serve (D48), or null when no M.O.M. is set — in which
   * case no picker is rendered at all rather than an empty one.
   *
   * **The picker is optional and must stay optional.** On the ordinary night when something
   * urgent is the honest answer, "nothing above it" is the true answer, and a plan that refused
   * to save without an anchor would train people to attach a lie. Nothing here defaults to
   * attached, and nothing warns about leaving it off.
   */
  activeMom: { id: number; title: string } | null;
}

let nextKey = 1;

export function NightPlanClient({ plannedDate, existingTitles, activeMom }: NightPlanClientProps) {
  const router = useRouter();
  const [items, setItems] = useState<DraftItem[]>(() =>
    existingTitles.length > 0
      ? existingTitles.map((title) => ({ key: nextKey++, title, rank: null, momId: null }))
      : [{ key: nextKey++, title: "", rank: null, momId: null }],
  );
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const takenRanks = new Set(items.map((i) => i.rank).filter((r): r is 1 | 2 | 3 => r != null));

  function addItem() {
    const title = draft.trim();
    if (title.length === 0) return;
    setItems((prev) => [...prev, { key: nextKey++, title, rank: null, momId: null }]);
    setDraft("");
    setSaved(null);
  }

  function removeItem(key: number) {
    setItems((prev) => prev.filter((i) => i.key !== key));
    setSaved(null);
  }

  /** Ranks are exclusive — the data layer rejects a duplicate, so the UI must not offer
   *  one. Assigning a rank another item holds moves it rather than duplicating it. */
  function setRank(key: number, rank: 1 | 2 | 3 | null) {
    setItems((prev) =>
      prev.map((item) => {
        if (item.key === key) return { ...item, rank };
        if (rank != null && item.rank === rank) return { ...item, rank: null };
        return item;
      }),
    );
    setSaved(null);
  }

  /** The optional anchor. Unchecking is always available; nothing defaults to attached. */
  function setAnchor(key: number, momId: number | null) {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, momId } : item)));
    setSaved(null);
  }

  function handleSave() {
    setError(undefined);
    const payload: NightPlanItem[] = items
      .map((i) => ({ title: i.title.trim(), rank: i.rank, momId: i.momId }))
      .filter((i) => i.title.length > 0);

    if (payload.length === 0) {
      setError("Add at least one thing before closing the plan.");
      return;
    }

    startTransition(async () => {
      const result = await saveNightPlanAction(payload);
      if (!result.ok) {
        setError(result.error ?? "Couldn't save the plan.");
        return;
      }
      setSaved(result.data?.created ?? payload.length);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel className="flex flex-col gap-3">
        <p className="text-body text-ink-muted">
          Dump everything on your mind for tomorrow first, then star three and crown one. The dump
          comes first on purpose — choosing before you have emptied your head just ranks whatever
          happens to be loudest.
        </p>
        {activeMom != null ? (
          <p className="text-body-s text-ink-muted">
            Each item can say what it serves, and none of them has to. Some nights the honest answer
            is that something urgent came up.
          </p>
        ) : null}
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1">
            <Input
              label="Add to the dump"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addItem();
                }
              }}
              placeholder="Email the TA about the regrade"
            />
          </div>
          <Button variant="secondary" onClick={addItem} disabled={draft.trim().length === 0}>
            Add
          </Button>
        </div>
      </Panel>

      <Panel title="Tomorrow" className="flex flex-col gap-3">
        {items.length === 0 ? (
          <p className="text-body-s text-ink-muted">Nothing yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li key={item.key} className="flex flex-wrap items-center gap-2 border-b border-hairline pb-2">
                <span className="min-w-[12rem] flex-1 text-body text-ink">{item.title || "—"}</span>
                <div className="flex items-center gap-1">
                  {([1, 2, 3] as const).map((rank) => (
                    <Button
                      key={rank}
                      variant={item.rank === rank ? "primary" : "ghost"}
                      onClick={() => setRank(item.key, item.rank === rank ? null : rank)}
                    >
                      {rank === 1 ? "MIT" : `#${rank}`}
                    </Button>
                  ))}
                  <Button variant="ghost" onClick={() => removeItem(item.key)}>
                    Remove
                  </Button>
                </div>
                {activeMom != null ? (
                  <label className="flex w-full items-center gap-2 text-body-s text-ink-muted">
                    <input
                      type="checkbox"
                      checked={item.momId != null}
                      onChange={(e) => setAnchor(item.key, e.target.checked ? activeMom.id : null)}
                      className="size-4 accent-[var(--color-accent)]"
                    />
                    Serves “{activeMom.title}”
                  </label>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
          {items.length} {items.length === 1 ? "item" : "items"} · {takenRanks.size} of 3 starred
          {takenRanks.has(1) ? " · MIT crowned" : ""}
        </p>
      </Panel>

      {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}
      {saved != null ? (
        <p className="text-body-s text-ink-muted">
          Saved {saved} {saved === 1 ? "item" : "items"} for {plannedDate}. These are ordinary tasks now —
          they will be on Today when you get there.
        </p>
      ) : null}

      <div>
        <Button onClick={handleSave} loading={isPending}>
          Close the day
        </Button>
      </div>
    </div>
  );
}
