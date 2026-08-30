"use client";

import type { ConfrontationOffer } from "@collegeos/core";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { respondToDriftAction } from "@/app/(app)/today/driftActions";

/**
 * The drift confrontation (D50).
 *
 * **What this component is not allowed to do**, and the reasons are the feature rather than
 * politeness:
 *
 * - **It adds no words about the user.** The only prose on screen that is about them is
 *   `offer.statement`, which they wrote. There is no generated line, no adjective, no "you said you
 *   wanted X but". If a future change wants to add a sentence here, that sentence would be the app
 *   forming an opinion about someone, which is exactly what the whole feature refuses to do.
 * - **It never renders without both doors.** They come from `offer.doors`, so the offer type itself
 *   makes a doorless confrontation unconstructible. Confrontation then path back, never
 *   confrontation alone.
 * - **It uses no alarm colour.** No red, no warning icon, no risk band. This is not an error state
 *   and styling it as one would make it a scolding. The user's own sentence is set in `ink` at
 *   reading size and everything around it is quiet.
 * - **Dismissing costs nothing.** No confirmation, no "are you sure", no counter. Someone who reads
 *   their own words and decides tonight is not the night has used this correctly.
 *
 * The evidence line is the one factual claim on screen, and it is deliberately checkable — "that
 * Hour ended with 9 distractions" is something the user can go and verify, which an assertion about
 * their character would not be.
 */
export function Confrontation({
  offer,
  eventId,
  onClose,
}: {
  offer: ConfrontationOffer;
  eventId: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  function respond(response: "started_hour" | "crowned_tomorrow" | "dismissed") {
    startTransition(async () => {
      await respondToDriftAction({ eventId, response });
      if (response === "dismissed") {
        setDismissed(true);
        onClose();
        return;
      }
      onClose();
      router.push(response === "started_hour" ? "/hour" : "/nightplan");
    });
  }

  return (
    <Panel>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          {/* Flat and factual. The emotional weight is supposed to come entirely from the
              sentence below, which is the only thing here allowed to carry any. */}
          <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
            You wrote this about {offer.dimensionName}
          </p>
          <p className="font-mono text-caption text-ink-faint">{offer.evidence}</p>
        </div>

        {/* Their words. Set at reading size, in ink, with nothing around them. */}
        <blockquote className="border-l-2 border-hairline pl-5 text-body-l leading-relaxed text-ink">
          {offer.statement}
        </blockquote>

        {/* The doors come from the offer, so this cannot render without them. */}
        <div className="flex flex-wrap items-center gap-3">
          {offer.doors.map((door) => (
            <button
              key={door}
              type="button"
              disabled={isPending}
              onClick={() => respond(door === "start_hour" ? "started_hour" : "crowned_tomorrow")}
              className={cn(
                "flex h-10 items-center rounded-md px-4 font-sans text-body font-medium outline-none",
                "transition-colors duration-150",
                "focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2",
                "disabled:pointer-events-none disabled:opacity-40",
                door === "start_hour"
                  ? "bg-accent text-accent-on hover:bg-accent-hover"
                  : "border border-border text-ink hover:bg-surface-sunken",
              )}
            >
              {door === "start_hour" ? "Start an Hour now" : "Crown it for tomorrow"}
            </button>
          ))}
          <button
            type="button"
            disabled={isPending}
            onClick={() => respond("dismissed")}
            className={cn(
              "font-sans text-body-s text-ink-muted underline underline-offset-2 outline-none",
              "hover:text-ink focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2",
              "disabled:pointer-events-none disabled:opacity-40",
            )}
          >
            Not now
          </button>
        </div>
      </div>
    </Panel>
  );
}
