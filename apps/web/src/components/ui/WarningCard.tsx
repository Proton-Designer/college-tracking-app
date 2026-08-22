import type { ReactNode } from "react";
import { color } from "@collegeos/design";
import { tintWithAlpha } from "@/lib/colorAlpha";
import { cn } from "./cn";

const TIER_CLASS = {
  base: "glass",
  sunken: "glass-sunken",
} as const;

export interface WarningCardProps {
  children: ReactNode;
  /** Defaults to riskHigh -- the only tone every call site has needed so far. Exposed rather
   *  than hardcoded since the shape (glass + low-alpha tint) is tone-agnostic. */
  tone?: string;
  /**
   * Defaults to "base" -- every free-standing call site (RecoveryBanner, the course-detail
   * weight-sum warning). Use "sunken" when this card is nested inside an ALREADY-glass Panel
   * (GenerateBackplanSection's regenerate-confirm well): two stacked base-glass layers share
   * the same edge/highlight treatment and compound into a nearly invisible boundary between
   * them -- confirmed by rendering both side by side, not assumed. glass-sunken's tighter blur
   * and lower fill keeps the nested well visually distinct from its parent panel.
   */
  tier?: keyof typeof TIER_CLASS;
  /** Radius/outer overrides -- defaults to rounded-lg. */
  className?: string;
  /** Padding/gap for the content layer -- defaults to p-5. A call site with its own established
   *  internal rhythm (RecoveryBanner's mt-* spaced children) can still just take the default. */
  contentClassName?: string;
}

/**
 * A real alert, expressed in v2's glass vocabulary rather than a flat colored box: glass +
 * its own neutral two-edge border (never overridden -- RecoveryBanner and the course-detail
 * weight-sum warning both got this wrong on the first pass, landing on a hard solid-color border
 * that read as v1 next to real glass). Alert identity is carried only by a low-alpha tint on the
 * content, painted as an ordinary background, not an absolutely-positioned overlay.
 *
 * Matches apps/mobile/src/components/ui/WarningCard.tsx's shape (same tone default, same 0.07
 * alpha) plus a `tier` prop mobile should carry too -- don't let the two platforms drift into
 * differently-structured versions of the same component.
 */
export function WarningCard({ children, tone = color.riskHigh, tier = "base", className, contentClassName }: WarningCardProps) {
  return (
    <div className={cn(TIER_CLASS[tier], "overflow-hidden", className ?? "rounded-lg")}>
      <div className={contentClassName ?? "p-5"} style={{ backgroundColor: tintWithAlpha(tone, 0.07) }}>
        {children}
      </div>
    </div>
  );
}
