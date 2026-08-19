"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: ButtonVariant;
  loading?: boolean;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: cn("bg-accent text-white", "hover:bg-accent-hover", "active:bg-accent-hover"),
  secondary: cn(
    "bg-surface text-ink border border-border",
    "hover:bg-surface-sunken",
    "active:bg-surface-sunken",
  ),
  ghost: cn("bg-transparent text-ink", "hover:bg-surface-sunken", "active:bg-surface-sunken"),
  destructive: cn("bg-risk-critical text-white", "hover:brightness-90", "active:brightness-90"),
};

export function Button({
  variant = "primary",
  loading = false,
  disabled = false,
  className,
  children,
  ...rest
}: ButtonProps) {
  // `disabled` blocks interaction in both cases (a loading button shouldn't be re-triggered),
  // but only a true (non-loading) disabled state dims — loading keeps the variant's full color so
  // the user can still see which action is in flight. Withdrawn vs. in-progress must read
  // differently; a primary action turning grey mid-submit reads as failure.
  const isInactive = disabled || loading;

  return (
    <button
      type="button"
      disabled={isInactive}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex h-10 min-w-[32px] items-center justify-center gap-2 rounded-md px-4",
        "font-sans text-body font-medium",
        "outline-none focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2",
        "transition-colors duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
        VARIANT_CLASSES[variant],
        disabled && !loading && "cursor-not-allowed opacity-40",
        loading && "cursor-wait",
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : null}
      {children}
    </button>
  );
}
