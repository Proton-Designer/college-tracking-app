"use client";

import { cn } from "./cn";
import { Label } from "./Label";

export interface ChipOption {
  value: string;
  label: string;
}

export interface ChipGroupProps {
  label: string;
  options: ChipOption[];
  value: string | null;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/** Single-select pill row for a short list of named reasons — the morning check-in's
 *  derailment prediction (§2) and Night Review's failure-reason log (§3) share this exact
 *  pattern, so it lives here rather than in either feature. */
export function ChipGroup({ label, options, value, onChange, disabled = false }: ChipGroupProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={cn(
                "rounded-pill border px-3.5 py-1.5",
                "font-sans text-body-s",
                "outline-none transition-colors duration-90",
                "focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2",
                selected
                  ? "border-accent bg-accent text-accent-on"
                  : "border-border bg-surface text-ink hover:bg-surface-sunken",
                disabled && "cursor-not-allowed opacity-40",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
