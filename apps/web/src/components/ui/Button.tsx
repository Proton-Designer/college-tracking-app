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
  primary: cn(
    "bg-accent text-white",
    "hover:bg-accent-hover",
    "active:bg-accent-hover",
    "disabled:bg-ink-faint disabled:text-white",
  ),
  secondary: cn(
    "bg-surface text-ink border border-border",
    "hover:bg-surface-sunken",
    "active:bg-surface-sunken",
    "disabled:border-hairline disabled:text-ink-faint disabled:bg-surface",
  ),
  ghost: cn(
    "bg-transparent text-ink",
    "hover:bg-surface-sunken",
    "active:bg-surface-sunken",
    "disabled:text-ink-faint",
  ),
  destructive: cn(
    "bg-risk-critical text-white",
    "hover:brightness-90",
    "active:brightness-90",
    "disabled:bg-ink-faint disabled:text-white",
  ),
};

export function Button({
  variant = "primary",
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      type="button"
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex h-10 min-w-[32px] items-center justify-center gap-2 rounded-md px-4",
        "font-sans text-body font-medium",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "transition-colors duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
        "disabled:cursor-not-allowed",
        VARIANT_CLASSES[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
      {children}
    </button>
  );
}
