"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface ModalProps {
  children: ReactNode;
  onDismiss?: () => void;
  labelledBy?: string;
}

/**
 * Accessible modal overlay with:
 * - role="dialog" + aria-labelledby
 * - Escape key dismissal
 * - Focus trap (Tab cycles within the modal)
 * - Focus restore on unmount
 *
 * Focus trap works by querying all focusable elements inside the dialog
 * on each Tab press. This is simpler than tracking mutations and handles
 * dynamic content (conditionally rendered buttons, etc.) automatically.
 */
export function Modal({ children, onDismiss, labelledBy }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // Capture the element that had focus before the modal opened
    // so we can restore it on unmount — standard a11y practice.
    previousFocusRef.current = document.activeElement as HTMLElement;

    // Auto-focus the first focusable element inside the modal
    const dialog = dialogRef.current;
    if (dialog) {
      const first = dialog.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      first?.focus();
    }

    return () => {
      previousFocusRef.current?.focus();
    };
  }, []);

  // Escape key handler
  useEffect(() => {
    if (!onDismiss) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss!();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onDismiss]);

  // Focus trap — keep Tab cycling within the modal
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Tab") return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusable = dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ct-paper/80 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onKeyDown={handleKeyDown}
        className="mx-4 w-full max-w-sm rounded-[--radius-md] border border-ct-rule bg-ct-paper p-6 shadow-[--shadow-md]"
      >
        {children}
      </div>
    </div>
  );
}
