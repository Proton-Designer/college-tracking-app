"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";
import { buttonClassName, type ButtonVariant } from "./buttonStyles";

export type { ButtonVariant };
export { buttonClassName };

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: ButtonVariant;
  loading?: boolean;
  children: ReactNode;
}

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
        buttonClassName(variant, { disabled: disabled && !loading }),
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
