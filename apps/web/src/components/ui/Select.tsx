"use client";

import { useId } from "react";
import { cn } from "./cn";
import { FieldError } from "./FieldError";
import { Label } from "./Label";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  label?: string;
  options: SelectOption[];
  value: string | null;
  onValueChange: (value: string) => void;
  /** Shown while value is null. Never a default selection -- unset stays unset. */
  placeholder?: string;
  disabled?: boolean;
  error?: string | undefined;
  required?: boolean;
  id?: string;
  className?: string;
  /** For a compact inline use with no visible `label` (a per-row control in a list, not
   *  a form field) -- without this, an unlabeled Select has no accessible name at all. */
  "aria-label"?: string;
}

/** A styled native <select> -- full keyboard/a11y support for free, matches Input's chrome. */
export function Select({
  label,
  options,
  value,
  onValueChange,
  placeholder = "Select…",
  disabled,
  error,
  required,
  id,
  className,
  "aria-label": ariaLabel,
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <Label htmlFor={selectId} required={required}>
          {label}
        </Label>
      ) : null}
      <select
        id={selectId}
        value={value ?? ""}
        disabled={disabled}
        aria-invalid={Boolean(error) || undefined}
        aria-required={required || undefined}
        aria-label={!label ? (ariaLabel ?? placeholder) : ariaLabel}
        onChange={(e) => onValueChange(e.target.value)}
        className={cn(
          "glass-sunken h-10 rounded-md border px-3",
          "font-sans text-body text-ink",
          "outline-none transition-colors duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
          error ? "border-risk-critical" : "border-border",
          !error && "hover:border-ink-muted",
          "focus-visible:border-accent focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2",
          "disabled:cursor-not-allowed disabled:border-hairline disabled:bg-surface-sunken disabled:text-ink-faint",
          value == null && "text-ink-faint",
          className,
        )}
      >
        <option value="" disabled hidden>
          {placeholder}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}
