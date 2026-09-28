"use client";

import { useEffect, useRef, type FormEvent } from "react";
import { ALLOWED_IMAGE_HOSTS, parseImageUrl } from "@/app/lib/image-hosts";
import { datesAreOrdered } from "@/app/lib/offers";
import { ImagePreview } from "../image-preview";

export type OfferDraft = {
  id: number | null;
  title: string;
  description: string;
  imageUrl: string;
  value: string;
  startDate: string;
  endDate: string;
  isPublished: boolean;
};

const fieldClass =
  "mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-black/40";
const labelClass = "block text-sm font-medium";
const hintClass = "mt-2 text-xs text-black/45";

type Props = {
  draft: OfferDraft | null;
  busy: boolean;
  error: string | null;
  onChange: (draft: OfferDraft) => void;
  onSubmit: (draft: OfferDraft) => void;
  onCancel: () => void;
};

export function OfferDialog({
  draft,
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

  // Mirrors the server rules so problems surface before a round trip.
  const checkedImage = draft
    ? parseImageUrl(draft.imageUrl, "Image URL")
    : null;
  const previewUrl = checkedImage?.ok ? checkedImage.value : null;
  const imageProblem =
    draft &&
    draft.imageUrl.trim().length > 0 &&
    checkedImage &&
    !checkedImage.ok
      ? checkedImage.error
      : null;

  const datesOk = draft
    ? datesAreOrdered(draft.startDate || null, draft.endDate || null)
    : true;
  const titleOk = draft ? draft.title.trim().length > 0 : false;
  const canSubmit = !busy && titleOk && imageProblem === null && datesOk;

  return (
    <dialog
      ref={dialogRef}
      onClose={onCancel}
      aria-label={draft?.id === null ? "Add offer" : "Edit offer"}
      className="w-[min(36rem,calc(100vw-2rem))] rounded-2xl border border-black/10 bg-[#f7f3ed] p-0 text-[#1f1a17] backdrop:bg-black/40"
    >
      {draft && (
        <form onSubmit={handleSubmit} className="p-6 md:p-8">
          <h2 className="text-2xl font-semibold tracking-tight">
            {draft.id === null ? "Add offer" : "Edit offer"}
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
              <label className={labelClass} htmlFor="offer-title">
                Title
              </label>
              <input
                id="offer-title"
                autoFocus
                required
                maxLength={90}
                value={draft.title}
                onChange={(event) =>
                  onChange({ ...draft, title: event.target.value })
                }
                placeholder="Weekend brunch special"
                className={fieldClass}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="offer-value">
                Offer value <span className="text-black/40">(optional)</span>
              </label>
              <input
                id="offer-value"
                maxLength={40}
                value={draft.value}
                onChange={(event) =>
                  onChange({ ...draft, value: event.target.value })
                }
                placeholder="20% off"
                aria-describedby="offer-value-hint"
                className={fieldClass}
              />
              <p id="offer-value-hint" className={hintClass}>
                Shown as a badge on your website. Any wording works.
              </p>
            </div>

            <div>
              <label className={labelClass} htmlFor="offer-description">
                Description <span className="text-black/40">(optional)</span>
              </label>
              <textarea
                id="offer-description"
                rows={3}
                maxLength={400}
                value={draft.description}
                onChange={(event) =>
                  onChange({ ...draft, description: event.target.value })
                }
                className={`${fieldClass} resize-none`}
              />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="offer-start">
                  Starts <span className="text-black/40">(optional)</span>
                </label>
                <input
                  id="offer-start"
                  type="date"
                  value={draft.startDate}
                  onChange={(event) =>
                    onChange({ ...draft, startDate: event.target.value })
                  }
                  className={fieldClass}
                />
              </div>

              <div>
                <label className={labelClass} htmlFor="offer-end">
                  Ends <span className="text-black/40">(optional)</span>
                </label>
                <input
                  id="offer-end"
                  type="date"
                  value={draft.endDate}
                  onChange={(event) =>
                    onChange({ ...draft, endDate: event.target.value })
                  }
                  aria-invalid={!datesOk}
                  aria-describedby="offer-date-hint"
                  className={fieldClass}
                />
              </div>
            </div>

            <p
              id="offer-date-hint"
              className={datesOk ? hintClass : "mt-2 text-xs text-red-900"}
            >
              {datesOk
                ? "Leave blank to run indefinitely. Both dates are included, and the offer hides itself once the end date passes."
                : "End date cannot be before the start date."}
            </p>

            <div>
              <label className={labelClass} htmlFor="offer-image">
                Image URL <span className="text-black/40">(optional)</span>
              </label>
              <input
                id="offer-image"
                type="url"
                value={draft.imageUrl}
                onChange={(event) =>
                  onChange({ ...draft, imageUrl: event.target.value })
                }
                placeholder={`https://${ALLOWED_IMAGE_HOSTS[0]}/...`}
                aria-invalid={imageProblem !== null}
                aria-describedby="offer-image-hint"
                className={fieldClass}
              />
              <p
                id="offer-image-hint"
                className={
                  imageProblem ? "mt-2 text-xs text-red-900" : hintClass
                }
              >
                {imageProblem ??
                  `Optional. Hosted on ${ALLOWED_IMAGE_HOSTS.join(" or ")}.`}
              </p>
            </div>

            <div>
              <span className={labelClass}>Preview</span>
              <div className="relative mt-2 h-40 overflow-hidden rounded-xl border border-black/10 bg-black/5">
                <ImagePreview
                  key={previewUrl ?? "empty"}
                  src={previewUrl}
                  alt=""
                  sizes="(max-width: 640px) 100vw, 34rem"
                  emptyLabel="No image — the offer shows as a text card"
                />
              </div>
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
              Publish this offer on the public website
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
              {busy ? "Saving..." : "Save offer"}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
