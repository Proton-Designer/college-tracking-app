import { cn } from "./cn";

export type ToastVariant = "default" | "success" | "error";

export interface ToastProps {
  variant?: ToastVariant;
  message: string;
  onDismiss?: () => void;
}

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  default: "",
  success: "border-l-2 border-l-risk-low",
  error: "border-l-2 border-l-risk-critical",
};

export function Toast({ variant = "default", message, onDismiss }: ToastProps) {
  return (
    <div
      role="status"
      className={cn(
        "glass-raised flex items-center gap-3 rounded-md px-4 py-3",
        VARIANT_CLASSES[variant],
      )}
    >
      <p className="text-body-s text-ink">{message}</p>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="ml-auto shrink-0 rounded-sm text-ink-faint outline-none hover:text-ink focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2"
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}
