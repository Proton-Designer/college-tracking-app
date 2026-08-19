import type { LabelHTMLAttributes } from "react";
import { cn } from "./cn";

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean | undefined;
}

export function Label({ required, className, children, ...rest }: LabelProps) {
  return (
    <label
      className={cn(
        "text-label uppercase tracking-[0.1em] text-ink-muted",
        className,
      )}
      {...rest}
    >
      {children}
      {required ? <span className="text-risk-critical"> *</span> : null}
    </label>
  );
}
