import type { ReactNode } from "react";
import { cn } from "./cn";

export interface PageHeaderProps {
  title: string;
  /** Secondary readout next to the title -- a date, a term, a range. Never a second heading. */
  context?: string;
  /** Right-aligned page-level actions (e.g. "Add course"). */
  actions?: ReactNode;
  className?: string;
  /** Passed straight through to the <h1> -- e2e specs assert against the title this way
   *  (e.g. course-detail.spec.ts's "course-detail-code") without needing a second,
   *  screen-reader-only heading just to carry a test hook. */
  titleTestId?: string;
}

/** Every screen was an <h1> immediately followed by content -- there was nowhere for a
 *  page-level action to live. Formalizes the title/context/actions row a few screens already
 *  hand-rolled ad hoc (Today's date + sleep readout, Night review's "Nightly report" link). */
export function PageHeader({ title, context, actions, className, titleTestId }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2", className)}>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <h1 data-testid={titleTestId} className="font-sans text-display-m font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h1>
        {context ? <p className="font-mono text-body-s tabular-nums text-ink-muted">{context}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
    </div>
  );
}
