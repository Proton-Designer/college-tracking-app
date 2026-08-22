"use client";

import { useId, type TextareaHTMLAttributes } from "react";
import { cn } from "./cn";
import { FieldError } from "./FieldError";
import { Label } from "./Label";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string | undefined;
  required?: boolean;
}

export function Textarea({
  label,
  error,
  required,
  id,
  className,
  disabled,
  rows = 4,
  ...rest
}: TextareaProps) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <Label htmlFor={textareaId} required={required}>
          {label}
        </Label>
      ) : null}
      <textarea
        id={textareaId}
        rows={rows}
        disabled={disabled}
        aria-invalid={Boolean(error) || undefined}
        aria-required={required || undefined}
        className={cn(
          "glass-sunken rounded-md border px-3 py-2",
          "font-sans text-body text-ink placeholder:text-ink-faint",
          "outline-none transition-colors duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
          "resize-none",
          error ? "border-risk-critical" : "border-border",
          !error && "hover:border-ink-muted",
          "focus-visible:border-accent focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2",
          "disabled:cursor-not-allowed disabled:border-hairline disabled:bg-surface-sunken disabled:text-ink-faint",
          className,
        )}
        {...rest}
      />
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}
