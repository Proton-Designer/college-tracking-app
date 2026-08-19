"use client";

import { useId } from "react";
import { cn } from "./cn";
import { FieldError } from "./FieldError";

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  error?: string | undefined;
}

export function Checkbox({ checked, onChange, label, disabled = false, error }: CheckboxProps) {
  const id = useId();

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className={cn(
          "flex items-center gap-2.5",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
      >
        <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
          <input
            id={id}
            type="checkbox"
            checked={checked}
            disabled={disabled}
            aria-invalid={Boolean(error) || undefined}
            onChange={(e) => onChange(e.target.checked)}
            className="peer absolute inset-0 h-full w-full cursor-pointer appearance-none outline-none disabled:cursor-not-allowed"
          />
          <span
            aria-hidden
            className={cn(
              "pointer-events-none h-5 w-5 rounded-sm border transition-colors duration-90",
              "flex items-center justify-center",
              checked ? "border-accent bg-accent" : "border-border bg-surface-sunken",
              !disabled && !checked && "peer-hover:border-ink-muted",
              "peer-focus-visible:[outline:2px_solid_var(--color-accent)] peer-focus-visible:outline-offset-2",
              disabled && (checked ? "border-ink-faint bg-ink-faint" : "border-hairline bg-surface-sunken"),
              error && !checked && "border-risk-critical",
            )}
          >
            {checked ? (
              <svg viewBox="0 0 12 10" className="h-2.5 w-3 fill-none stroke-white stroke-[2]">
                <path d="M1 5L4.5 8.5L11 1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : null}
          </span>
        </span>
        <span className={cn("text-body text-ink", disabled && "text-ink-faint")}>{label}</span>
      </label>
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}
