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
 *  edge to slide from, so this fades in centered as raised glass (DESIGN_LANGUAGE_V2 §2's
 *  `glassRaised` tier -- modals/sheets/popovers), with `radius.xl` matching the island. */
export function Modal({ open, onClose, title, children, footer, dismissable = true, className }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Callers pass inline arrows as onClose, so its identity changes every parent render.
  // The focus-trap effect below must depend only on `open`: with onClose in its deps, any
  // keystroke inside the modal re-rendered the parent, re-ran the effect, and the
  // cleanup/setup pair yanked focus out of whatever field the user was typing in
  // (cleanup refocuses the trigger, setup refocuses the dialog) -- found live in the
  // announcement paste flow, one focus loss per letter. Refs keep the latest values
  // without making them dependencies; requiring useCallback of every caller would fix
  // one call site and leave the trap armed for the next.
  const onCloseRef = useRef(onClose);
  const dismissableRef = useRef(dismissable);
  useEffect(() => {
    onCloseRef.current = onClose;
    dismissableRef.current = dismissable;
  });

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    // A modal that lets Tab escape into the dimmed page behind it isn't really modal --
    // a keyboard user ends up interacting with content they can't see is still live. Cycle
    // focus within the dialog's own focusable elements instead of letting the browser's
    // default tab order walk out of it.
    function focusableElements(): HTMLElement[] {
      const root = dialogRef.current;
      if (!root) return [];
      return Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && dismissableRef.current) {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;

      const focusable = focusableElements();
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        e.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const active = document.activeElement;

      if (e.shiftKey && (active === first || active === dialogRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open]);

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
          "modal-fade-in glass-raised relative flex max-h-[85vh] w-full max-w-[480px] flex-col gap-4",
          "overflow-y-auto rounded-xl p-6",
          "outline-none focus-visible:[outline:2px_solid_var(--color-accent)] focus-visible:outline-offset-2",
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
