import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  children: ReactNode;
}

/** A readout panel sitting on the ground. No shadow — ever. Hairline + surface do the work. */
export function Panel({ title, className, children, ...rest }: PanelProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-hairline bg-surface p-5",
        className,
      )}
      {...rest}
    >
      {title ? (
        <h3 className="mb-3 font-sans text-title font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h3>
      ) : null}
      {children}
    </div>
  );
}
