"use client";

import { useState } from "react";
import type { AnnouncementRow } from "@collegeos/api";
import { Panel } from "@/components/ui";

const STATUS_LABEL: Record<string, string> = {
  applied: "Applied",
  no_schedulable_content: "Filed — nothing schedulable",
  rejected: "Rejected",
  parsed: "Awaiting review",
  pending: "Not parsed yet",
  failed: "Parse failed",
};

/**
 * The per-course announcement record -- BLUEPRINT 5.2's "filed to the course", ported
 * from mobile's AnnouncementHistorySection (the fix for the recorded gap: the worklist
 * showed pending only, and a filed announcement vanished). Collapsed by default:
 * history is reference, not a feed. Data is fetched server-side in this route's data.ts
 * alongside everything else on the page, not self-fetched here.
 */
export function AnnouncementHistorySection({ announcements }: { announcements: AnnouncementRow[] }) {
  const [open, setOpen] = useState(false);

  if (announcements.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 font-mono text-label uppercase tracking-[0.1em] text-ink-muted hover:text-ink"
      >
        Announcements — {announcements.length} on record {open ? "▾" : "▸"}
      </button>
      {open ? (
        <div className="flex flex-col gap-3">
          {announcements.map((a) => (
            <Panel key={a.id} tone="sunken">
              <div className="flex items-baseline justify-between gap-4">
                <span className="font-mono text-caption text-ink-faint">
                  {new Date(a.created_at).toLocaleDateString()}
                  {a.source === "canvas" ? " · Canvas" : " · pasted"}
                </span>
                <span className={`font-mono text-caption ${a.status === "failed" ? "text-risk-critical" : "text-ink-muted"}`}>
                  {STATUS_LABEL[a.status] ?? a.status}
                </span>
              </div>
              <p className="mt-2 line-clamp-3 text-body-s text-ink">{a.raw_text}</p>
            </Panel>
          ))}
        </div>
      ) : null}
    </section>
  );
}
