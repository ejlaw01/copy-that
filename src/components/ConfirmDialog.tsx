"use client";

import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";

interface ConfirmDialogProps {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal onDismiss={onCancel} labelledBy="confirm-dialog-message">
      <p id="confirm-dialog-message" className="text-sm text-ct-ink">{message}</p>
      <div className="mt-5 flex items-center justify-end gap-3">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant="danger" size="sm" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
