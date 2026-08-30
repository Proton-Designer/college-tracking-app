import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: cn("bg-accent text-accent-on", "hover:bg-accent-hover", "active:bg-accent-hover"),
  secondary: cn(
    "bg-surface text-ink border border-border",
    "hover:bg-surface-sunken",
    "active:bg-surface-sunken",
  ),
  ghost: cn("bg-transparent text-ink", "hover:bg-surface-sunken", "active:bg-surface-sunken"),
  destructive: cn("bg-risk-critical text-accent-on", "hover:brightness-90", "active:brightness-90"),
};

/**
 * The Button's visual treatment, exposed so a `<Link>` (or anything else that can't be a real
 * `<button>`) can look identical to one — and so it can be called from Server Components, which
 * can't call a function from a "use client" module. Prefer `<Button>` itself for anything that's
 * actually a button; use this only for real navigation.
 */
export function buttonClassName(
  variant: ButtonVariant = "primary",
  { disabled = false, className }: { disabled?: boolean; className?: string } = {},
): string {
  return cn(
    "inline-flex h-10 min-w-[32px] items-center justify-center gap-2 rounded-md px-4",
    "font-sans text-body font-medium",
    "outline-none focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2",
    "transition-colors duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
    VARIANT_CLASSES[variant],
    disabled && "pointer-events-none cursor-not-allowed opacity-40",
    className,
  );
}
