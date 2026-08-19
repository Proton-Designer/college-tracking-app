import { Button } from "./Button";

export interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** States what the screen is for and gives one action. Never an illustration, never a mood. */
export function EmptyState({ title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-hairline p-8">
      <h3 className="font-sans text-title font-semibold text-ink">{title}</h3>
      <p className="text-body text-ink-muted">{description}</p>
      {actionLabel && onAction ? (
        <Button variant="secondary" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
