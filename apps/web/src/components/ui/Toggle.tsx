"use client";

import { useId } from "react";
import { cn } from "./cn";

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, disabled = false }: ToggleProps) {
  const id = useId();

  return (
    <label
      htmlFor={id}
      className={cn(
        "flex items-center justify-between gap-3",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
      )}
    >
      <span className={cn("text-body text-ink", disabled && "text-ink-faint")}>{label}</span>
      <span className="relative inline-flex h-6 w-10 shrink-0 items-center">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 h-full w-full cursor-pointer appearance-none outline-none disabled:cursor-not-allowed"
        />
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 rounded-pill border transition-colors duration-150",
            checked ? "border-accent bg-accent" : "border-border bg-surface-sunken",
            "peer-focus-visible:[outline:2px_solid_var(--color-accent)] peer-focus-visible:outline-offset-2",
            disabled && (checked ? "border-ink-faint bg-ink-faint" : "border-hairline bg-surface-sunken"),
          )}
        />
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute h-4 w-4 rounded-pill bg-white transition-transform duration-150",
            checked ? "translate-x-[19px]" : "translate-x-[3px]",
          )}
        />
      </span>
    </label>
  );
}
