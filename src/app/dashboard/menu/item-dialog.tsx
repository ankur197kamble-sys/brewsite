"use client";

import { useEffect, useRef, type FormEvent } from "react";
import { parsePrice, type MenuCategoryView } from "@/app/lib/menu";

export type ItemDraft = {
  id: number | null;
  categoryId: number;
  name: string;
  description: string;
  price: string;
  imageUrl: string;
  isPublished: boolean;
};

const fieldClass =
  "mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-black/40";
const labelClass = "block text-sm font-medium";

type Props = {
  draft: ItemDraft | null;
  categories: MenuCategoryView[];
  busy: boolean;
  error: string | null;
  onChange: (draft: ItemDraft) => void;
  onSubmit: (draft: ItemDraft) => void;
  onCancel: () => void;
};

export function ItemDialog({
  draft,
  categories,
  busy,
  error,
  onChange,
  onSubmit,
  onCancel,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (draft && !dialog.open) dialog.showModal();
    if (!draft && dialog.open) dialog.close();
  }, [draft]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft) onSubmit(draft);
  }

  const priceIsValid = draft === null || parsePrice(draft.price) !== null;
  const canSubmit =
    draft !== null && draft.name.trim().length > 0 && priceIsValid && !busy;

  return (
    <dialog
      ref={dialogRef}
      onClose={onCancel}
      aria-label={draft?.id === null ? "Add menu item" : "Edit menu item"}
      className="w-[min(34rem,calc(100vw-2rem))] rounded-2xl border border-black/10 bg-[#f7f3ed] p-0 text-[#1f1a17] backdrop:bg-black/40"
    >
      {draft && (
        <form onSubmit={handleSubmit} className="p-6 md:p-8">
          <h2 className="text-2xl font-semibold tracking-tight">
            {draft.id === null ? "Add menu item" : "Edit menu item"}
          </h2>

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-red-900/20 bg-red-50 px-4 py-3 text-sm text-red-900"
            >
              {error}
            </p>
          )}

          <div className="mt-6 space-y-5">
            <div>
              <label className={labelClass} htmlFor="item-name">
                Name
              </label>
              <input
                id="item-name"
                autoFocus
                required
                maxLength={120}
                value={draft.name}
                onChange={(event) =>
                  onChange({ ...draft, name: event.target.value })
                }
                className={fieldClass}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="item-category">
                Category
              </label>
              <select
                id="item-category"
                required
                value={draft.categoryId}
                onChange={(event) =>
                  onChange({ ...draft, categoryId: Number(event.target.value) })
                }
                className={fieldClass}
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass} htmlFor="item-price">
                Price
              </label>
              <input
                id="item-price"
                required
                inputMode="decimal"
                placeholder="220.00"
                value={draft.price}
                onChange={(event) =>
                  onChange({ ...draft, price: event.target.value })
                }
                aria-invalid={!priceIsValid}
                className={fieldClass}
              />
              {!priceIsValid && (
                <p className="mt-2 text-sm text-red-900">
                  Enter a valid amount, for example 220 or 220.50
                </p>
              )}
            </div>

            <div>
              <label className={labelClass} htmlFor="item-description">
                Description <span className="text-black/40">(optional)</span>
              </label>
              <textarea
                id="item-description"
                rows={3}
                maxLength={500}
                value={draft.description}
                onChange={(event) =>
                  onChange({ ...draft, description: event.target.value })
                }
                className={`${fieldClass} resize-none`}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="item-image">
                Image URL <span className="text-black/40">(optional)</span>
              </label>
              <input
                id="item-image"
                type="url"
                placeholder="https://..."
                value={draft.imageUrl}
                onChange={(event) =>
                  onChange({ ...draft, imageUrl: event.target.value })
                }
                className={fieldClass}
              />
            </div>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={draft.isPublished}
                onChange={(event) =>
                  onChange({ ...draft, isPublished: event.target.checked })
                }
                className="h-4 w-4 rounded border-black/20"
              />
              Show this item on the public website
            </label>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full border border-black/15 px-6 py-3 text-sm font-medium transition hover:bg-black/5"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-full bg-[#1f1a17] px-6 py-3 text-sm font-medium text-white transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Saving..." : "Save item"}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
