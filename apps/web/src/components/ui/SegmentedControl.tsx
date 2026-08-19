"use client";

import { cn } from "./cn";
import { Label } from "./Label";

export interface SegmentedControlProps {
  label: string;
  value: number | null;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}

/**
 * A row of discrete cells — not a slider. Used for the 1–10 energy/mood scales (§7): discrete
 * values deserve a discrete control, and it makes the tap target honest.
 */
export function SegmentedControl({
  label,
  value,
  onChange,
  min = 1,
  max = 10,
  disabled = false,
}: SegmentedControlProps) {
  const cells = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div role="radiogroup" aria-label={label} className="flex gap-1">
        {cells.map((cell) => {
          const selected = value === cell;
          return (
            <button
              key={cell}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(cell)}
              className={cn(
                "flex h-9 flex-1 items-center justify-center rounded-sm border",
                "font-mono text-body-s tabular-nums",
                "outline-none transition-colors duration-90",
                "focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2",
                selected
                  ? "border-accent bg-accent text-white"
                  : "border-border bg-surface-sunken text-ink hover:bg-surface",
                disabled && "cursor-not-allowed border-hairline bg-surface-sunken text-ink-faint hover:bg-surface-sunken",
              )}
            >
              {cell}
            </button>
          );
        })}
      </div>
    </div>
  );
}
