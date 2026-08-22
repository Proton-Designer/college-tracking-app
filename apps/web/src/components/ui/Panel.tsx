import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export type PanelTone = "surface" | "raised" | "sunken";

const TONE_CLASS: Record<PanelTone, string> = {
  surface: "glass",
  raised: "glass-raised",
  sunken: "glass-sunken",
};

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  tone?: PanelTone;
  children: ReactNode;
}

/** A readout panel floating on the ground. Glass, not a flat hairline box — `shadowGlass`
 *  is what makes it float (v1's "no shadow" rule is reversed in Aurora, DESIGN_LANGUAGE_V2 §4).
 *  `sunken` tone is for a readout nested a level deeper than its parent (a well). */
export function Panel({ title, tone = "surface", className, children, ...rest }: PanelProps) {
  return (
    <div className={cn("rounded-lg p-5", TONE_CLASS[tone], className)} {...rest}>
      {title ? (
        <h3 className="mb-3 font-sans text-title font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h3>
      ) : null}
      {children}
    </div>
  );
}

export interface PanelButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  title?: string;
  tone?: PanelTone;
  children: ReactNode;
}

/** The tappable variant of Panel — a real `<button>`, not a `<div onClick>`, for the rare
 *  case a panel IS the interactive unit rather than a static readout housing other controls. */
export function PanelButton({ title, tone = "surface", className, children, ...rest }: PanelButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "w-full rounded-lg p-5 text-left",
        "transition-[filter] duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
        TONE_CLASS[tone],
        "hover:brightness-[1.03] active:brightness-[0.98]",
        "outline-none focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2",
        "disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
      {...rest}
    >
      {title ? (
        <h3 className="mb-3 font-sans text-title font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h3>
      ) : null}
      {children}
    </button>
  );
}
