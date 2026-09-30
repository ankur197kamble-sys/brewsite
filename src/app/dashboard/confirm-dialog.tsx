"use client";

import { useEffect, useRef } from "react";

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onCancel}
      aria-label={title}
      className="w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-black/10 bg-[#f7f3ed] p-0 text-[#1f1a17] backdrop:bg-black/40"
    >
      <div className="p-6 md:p-8">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-black/60">{message}</p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            autoFocus
            className="rounded-full border border-black/15 px-6 py-3 text-sm font-medium transition hover:bg-black/5"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-full bg-red-900 px-6 py-3 text-sm font-medium text-white transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
