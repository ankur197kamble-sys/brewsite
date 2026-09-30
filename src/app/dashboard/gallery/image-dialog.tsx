"use client";

import { useEffect, useRef, type FormEvent } from "react";
import { ImagePreview } from "../image-preview";
import { ALLOWED_IMAGE_HOSTS, parseImageUrl } from "@/app/lib/image-hosts";

export type ImageDraft = {
  id: number | null;
  url: string;
  alt: string;
  isPublished: boolean;
};

const fieldClass =
  "mt-2 w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-black/40";

type Props = {
  draft: ImageDraft | null;
  busy: boolean;
  error: string | null;
  onChange: (draft: ImageDraft) => void;
  onSubmit: (draft: ImageDraft) => void;
  onCancel: () => void;
};

export function ImageDialog({
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

  // Same rule the API enforces, so the preview only shows a URL that will save.
  const checked = draft ? parseImageUrl(draft.url, "Image URL") : null;
  const previewUrl = checked?.ok ? checked.value : null;
  const urlProblem =
    draft && draft.url.trim().length > 0 && checked && !checked.ok
      ? checked.error
      : null;

  return (
    <dialog
      ref={dialogRef}
      onClose={onCancel}
      aria-label={
        draft?.id === null ? "Add gallery image" : "Edit gallery image"
      }
      className="w-[min(34rem,calc(100vw-2rem))] rounded-2xl border border-black/10 bg-[#f7f3ed] p-0 text-[#1f1a17] backdrop:bg-black/40"
    >
      {draft && (
        <form onSubmit={handleSubmit} className="p-6 md:p-8">
          <h2 className="text-2xl font-semibold tracking-tight">
            {draft.id === null ? "Add gallery image" : "Edit gallery image"}
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
              <label className="block text-sm font-medium" htmlFor="image-url">
                Image URL
              </label>
              <input
                id="image-url"
                type="url"
                autoFocus
                required
                value={draft.url}
                onChange={(event) =>
                  onChange({ ...draft, url: event.target.value })
                }
                placeholder={`https://${ALLOWED_IMAGE_HOSTS[0]}/...`}
                aria-invalid={urlProblem !== null}
                aria-describedby="image-url-hint"
                className={fieldClass}
              />
              <p id="image-url-hint" className="mt-2 text-xs text-black/45">
                {urlProblem ?? `Hosted on ${ALLOWED_IMAGE_HOSTS.join(" or ")}.`}
              </p>
            </div>

            <div>
              <span className="block text-sm font-medium">Preview</span>
              <div className="relative mt-2 h-44 overflow-hidden rounded-xl border border-black/10 bg-black/5">
                <ImagePreview
                  key={previewUrl ?? "empty"}
                  src={previewUrl}
                  alt=""
                  sizes="(max-width: 640px) 100vw, 32rem"
                  emptyLabel="Paste a valid image URL to preview it"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium" htmlFor="image-alt">
                Alt text <span className="text-black/40">(optional)</span>
              </label>
              <input
                id="image-alt"
                type="text"
                maxLength={200}
                value={draft.alt}
                onChange={(event) =>
                  onChange({ ...draft, alt: event.target.value })
                }
                placeholder="Morning light over the counter"
                aria-describedby="image-alt-hint"
                className={fieldClass}
              />
              <p id="image-alt-hint" className="mt-2 text-xs text-black/45">
                Describes the photo for screen readers and search engines.
              </p>
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
              Show this photo on the public website
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
              disabled={busy || previewUrl === null}
              className="rounded-full bg-[#1f1a17] px-6 py-3 text-sm font-medium text-white transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Saving..." : "Save image"}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}
