"use client";

import { useId, type InputHTMLAttributes } from "react";
import { cn } from "./cn";
import { FieldError } from "./FieldError";
import { Label } from "./Label";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  error?: string;
  required?: boolean;
}

export function Input({ label, error, required, id, className, disabled, ...rest }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <Label htmlFor={inputId} required={required}>
          {label}
        </Label>
      ) : null}
      <input
        id={inputId}
        disabled={disabled}
        aria-invalid={Boolean(error) || undefined}
        aria-required={required || undefined}
        className={cn(
          "h-10 rounded-md border bg-surface-sunken px-3",
          "font-sans text-body text-ink placeholder:text-ink-faint",
          "outline-none transition-colors duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
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
