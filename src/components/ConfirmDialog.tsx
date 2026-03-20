"use client";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ct-paper/80 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-[--radius-md] border border-ct-rule bg-ct-paper p-6 shadow-lg">
        <p className="text-sm text-ct-ink">{message}</p>
        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="ct-btn ct-btn-secondary text-xs"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="ct-btn text-xs bg-ct-strike text-white"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
