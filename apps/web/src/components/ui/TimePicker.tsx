"use client";

import { useId } from "react";
import { cn } from "./cn";
import { FieldError } from "./FieldError";
import { Label } from "./Label";

export interface TimePickerProps {
  label?: string;
  /** Local wall-clock time, "HH:MM" 24h -- no date, no timezone, same shape CheckinFlow's
   *  timebox field already used before mobile's version replaced its free-text input. */
  value: string | null;
  onValueChange: (value: string | null) => void;
  disabled?: boolean;
  error?: string | undefined;
  required?: boolean;
  id?: string;
  className?: string;
}

/** A styled native <input type="time"> -- matches DatePicker's chrome and its "unset is a
 *  real, visible state" discipline: an empty field, not a hidden default of the current time. */
export function TimePicker({ label, value, onValueChange, disabled, error, required, id, className }: TimePickerProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <Label htmlFor={inputId} required={required}>
          {label}
        </Label>
      ) : null}
      <div className="flex items-center gap-3">
        <input
          id={inputId}
          type="time"
          value={value ?? ""}
          disabled={disabled}
          aria-invalid={Boolean(error) || undefined}
          aria-required={required || undefined}
          onChange={(e) => onValueChange(e.target.value === "" ? null : e.target.value)}
          className={cn(
            "h-10 flex-1 rounded-md border bg-surface-sunken px-3",
            "font-mono text-body-s tabular-nums text-ink",
            "outline-none transition-colors duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
            error ? "border-risk-critical" : "border-border",
            !error && "hover:border-ink-muted",
            "focus-visible:border-accent focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2",
            "disabled:cursor-not-allowed disabled:border-hairline disabled:bg-surface-sunken disabled:text-ink-faint",
            className,
          )}
        />
        {value && !disabled ? (
          <button
            type="button"
            onClick={() => onValueChange(null)}
            className={cn(
              "font-mono text-caption text-ink-faint underline underline-offset-2",
              "outline-none hover:text-ink",
              "focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2",
            )}
          >
            Clear
          </button>
        ) : null}
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}
