import type { ReactNode } from "react";
import { Button } from "./Button";

export interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  /** For an action that needs its own state (a modal trigger, a form) rather than a
   *  single callback -- takes over the action slot entirely; actionLabel/onAction are
   *  ignored when this is set. Lets a server component compose a client action
   *  component into the slot without passing a function across the boundary. */
  action?: ReactNode;
}

/** States what the screen is for and gives one action. Never an illustration, never a mood. */
export function EmptyState({ title, description, actionLabel, onAction, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-hairline p-8">
      <h3 className="font-sans text-title font-semibold text-ink">{title}</h3>
      <p className="text-body text-ink-muted">{description}</p>
      {action ? (
        action
      ) : actionLabel && onAction ? (
        <Button variant="secondary" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
