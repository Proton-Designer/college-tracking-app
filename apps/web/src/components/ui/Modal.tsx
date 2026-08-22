"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "./cn";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Right-aligned footer row, e.g. Cancel/Save. */
  footer?: ReactNode;
  /** Backdrop click and Escape close it. Default true. */
  dismissable?: boolean;
  className?: string;
}

/** A centered dialog, not a sheet -- mobile's Modal slides up from the bottom edge (the
 *  design system defines a dedicated "sheet" spring for exactly that motion); desktop has no
 *  edge to slide from, so this fades in centered with the one documented "overlay" shadow
 *  this system allows on a genuinely floating element. */
export function Modal({ open, onClose, title, children, footer, dismissable = true, className }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && dismissable) onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open, dismissable, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center p-6">
      <div
        className="absolute inset-0 bg-ink/40"
        onClick={dismissable ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "modal-fade-in relative flex max-h-[85vh] w-full max-w-[480px] flex-col gap-4",
          "overflow-y-auto rounded-lg bg-surface p-6 shadow-overlay outline-none",
          className,
        )}
      >
        {title ? (
          <h2 className="font-sans text-title font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        ) : null}
        {children}
        {footer ? <div className="flex justify-end gap-3">{footer}</div> : null}
      </div>
    </div>
  );
}
