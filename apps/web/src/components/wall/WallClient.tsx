"use client";

import { useMemo, useState, useTransition } from "react";
import type { WallCursor, WallPage, WallTile } from "@collegeos/api";
import { Button, EmptyState, Panel } from "@/components/ui";
import { loadOlderWallAction } from "@/app/(app)/wall/wallActions";

export interface WallClientProps {
  initialPage: WallPage;
}

interface WallDay {
  localDate: string;
  tiles: WallTile[];
  minutes: number;
}

/** Groups the flat keyset page into days without reordering. The server already returns
 *  (local_date desc, hour_index desc), so a day split across a page boundary merges into
 *  the day already on screen rather than opening a second heading for the same date. */
function groupByDay(tiles: WallTile[]): WallDay[] {
  const days: WallDay[] = [];
  for (const tile of tiles) {
    const last = days[days.length - 1];
    if (last && last.localDate === tile.localDate) {
      last.tiles.push(tile);
      last.minutes += tile.minutes;
      continue;
    }
    days.push({ localDate: tile.localDate, tiles: [tile], minutes: tile.minutes });
  }
  return days;
}

function formatDay(localDate: string): string {
  // Parsed as a local wall-clock date, never `new Date(localDate)` -- that reads a bare
  // YYYY-MM-DD as UTC midnight and renders the previous day west of Greenwich (B4).
  const [y, m, d] = localDate.split("-").map(Number);
  if (y == null || m == null || d == null) return localDate;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function WallClient({ initialPage }: WallClientProps) {
  const [tiles, setTiles] = useState<WallTile[]>(initialPage.tiles);
  const [cursor, setCursor] = useState<WallCursor | null>(initialPage.nextCursor);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  const days = useMemo(() => groupByDay(tiles), [tiles]);
  const totalCount = initialPage.totalCount;

  function handleLoadOlder() {
    if (cursor == null) return;
    setError(undefined);
    startTransition(async () => {
      const result = await loadOlderWallAction(cursor);
      if (!result.ok || !result.data) {
        setError(result.error ?? "Couldn't load older Hours.");
        return;
      }
      // Guard against a double-submit appending the same page twice.
      const known = new Set(tiles.map((t) => t.id));
      const fresh = result.data.tiles.filter((t) => !known.has(t.id));
      setTiles((prev) => [...prev, ...fresh]);
      setCursor(result.data.nextCursor);
    });
  }

  if (tiles.length === 0) {
    return (
      <EmptyState
        title="No Hours yet"
        description="The Wall fills one completed Hour at a time. Start one from Today and it lands here — it only ever grows."
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
          {totalCount != null ? `${totalCount} Hours all time` : `${tiles.length} Hours loaded`}
        </p>
        <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
          {days.length} {days.length === 1 ? "day" : "days"} shown
        </p>
      </div>

      <div className="flex flex-col gap-7">
        {days.map((day) => (
          <section key={day.localDate} className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-4 border-b border-hairline pb-2">
              <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink">{formatDay(day.localDate)}</h2>
              <span className="font-mono text-label tabular-nums text-ink-muted">
                {day.tiles.length}h · {day.minutes}m logged
              </span>
            </div>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {day.tiles.map((tile) => (
                <li key={tile.id}>
                  <Panel tone="sunken" className="flex h-full flex-col gap-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-mono text-label uppercase tracking-[0.1em] text-accent">
                        Hour {tile.hourIndex}
                      </span>
                      <span className="font-mono text-label tabular-nums text-ink-muted">{tile.minutes}m</span>
                    </div>
                    <p className="text-body text-ink">{tile.deliverable ?? "Untitled Hour"}</p>
                    <div className="mt-auto flex items-baseline justify-between gap-3 pt-1">
                      <span className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
                        {tile.category ?? "Uncategorised"}
                      </span>
                      {tile.interruptions > 0 ? (
                        <span className="font-mono text-label tabular-nums text-ink-muted">
                          {tile.interruptions} interrupted
                        </span>
                      ) : null}
                    </div>
                  </Panel>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}

      {cursor != null ? (
        <div>
          <Button variant="secondary" onClick={handleLoadOlder} loading={isPending}>
            Show older Hours
          </Button>
        </div>
      ) : (
        <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
          That&apos;s the whole Wall.
        </p>
      )}
    </div>
  );
}
