"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ReviewableAnnouncement } from "@collegeos/api";
import { Button, EmptyState, Panel } from "@/components/ui";
import { reparseAnnouncementAction } from "@/app/(app)/announcements/announcementsActions";

export interface AnnouncementsClientProps {
  items: ReviewableAnnouncement[];
  courseCodeById: Record<number, string>;
}

export function AnnouncementsClient({ items, courseCodeById }: AnnouncementsClientProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);

  const [isPending, startTransition] = useTransition();

  function handleReparse(item: ReviewableAnnouncement) {
    setError(undefined);
    setBusyId(item.id);
    startTransition(async () => {
      const result = await reparseAnnouncementAction(item.id);
      setBusyId(null);
      if (!result.ok || !result.data) {
        setError(result.error ?? "Couldn't parse that announcement.");
        return;
      }
      if (result.data.kind === "parsed") {
        router.push(`/announcements/${item.id}`);
        return;
      }
      // Filed as no-schedulable-content -- drops off the worklist on its own.
      router.refresh();
    });
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="Nothing waiting"
        description="New Canvas announcements land here after each poll, alongside anything pasted and not yet reviewed."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? <p className="text-body-s text-risk-critical">{error}</p> : null}
      {items.map((item) => (
        <Panel key={item.id} className="flex flex-col gap-2">
          <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
            {courseCodeById[item.courseId] ?? `Course #${item.courseId}`}
            {item.source === "canvas" ? " · Canvas" : " · pasted"} · {new Date(item.createdAt).toLocaleDateString()}
          </p>
          <p className="line-clamp-4 text-body text-ink">{item.rawText}</p>
          {item.status === "failed" && item.failureReason != null ? (
            <p className="text-body-s text-risk-critical">Parse failed: {item.failureReason}</p>
          ) : null}
          <div className="pt-1">
            {item.status === "parsed" ? (
              <Button onClick={() => router.push(`/announcements/${item.id}`)}>Review changes</Button>
            ) : (
              <Button variant="secondary" onClick={() => handleReparse(item)} loading={busyId === item.id} disabled={isPending}>
                {item.status === "failed" ? "Retry parse" : "Parse now"}
              </Button>
            )}
          </div>
        </Panel>
      ))}
    </div>
  );
}
