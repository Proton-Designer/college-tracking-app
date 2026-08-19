import type { ReactNode } from "react";
import { cn } from "./cn";

export type BadgeTone = "neutral" | "accent";

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-surface-sunken text-ink-muted",
  accent: "bg-accent-wash text-accent",
};

/** For non-risk labels (counts, status words). Use RiskPill for the four risk bands. */
export function Badge({ tone = "neutral", children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill px-3 py-1",
        "font-mono text-label uppercase tracking-[0.1em]",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
