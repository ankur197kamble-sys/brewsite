"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GalleryImageView } from "@/app/lib/gallery";
import { ConfirmDialog } from "../confirm-dialog";
import { ImageDialog, type ImageDraft } from "./image-dialog";
import { ImagePreview } from "../image-preview";

const primaryButton =
  "rounded-full bg-[#1f1a17] px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40";
const ghostButton =
  "rounded-full border border-black/15 px-4 py-2 text-sm transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40";
const iconButton =
  "rounded-full border border-black/15 px-3 py-2 text-sm leading-none transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-30";

type RequestResult = { ok: true } | { ok: false; message: string };

function errorMessage(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const { message } = payload as { message?: unknown };
  return typeof message === "string" ? message : null;
}

function blankDraft(): ImageDraft {
  return { id: null, url: "", alt: "", isPublished: true };
}

export function GalleryManager({ images }: { images: GalleryImageView[] }) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ImageDraft | null>(null);
  const [pendingDelete, setPendingDelete] = useState<GalleryImageView | null>(
    null,
  );

  const working = busy || isRefreshing;
  const publishedCount = images.filter((image) => image.isPublished).length;

  async function request(
    url: string,
    method: string,
    body?: unknown,
  ): Promise<RequestResult> {
    setBusy(true);

    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        return {
          ok: false,
          message: errorMessage(payload) ?? "Something went wrong",
        };
      }

      startTransition(() => router.refresh());
      return { ok: true };
    } catch {
      return { ok: false, message: "Network error. Please try again." };
    } finally {
      setBusy(false);
    }
  }

  async function handleSave(image: ImageDraft) {
    setDialogError(null);

    const body = {
      url: image.url,
      alt: image.alt,
      isPublished: image.isPublished,
    };

    const result =
      image.id === null
        ? await request("/api/gallery", "POST", body)
        : await request(`/api/gallery/${image.id}`, "PATCH", body);

    if (result.ok) {
      setDraft(null);
      setError(null);
    } else {
      setDialogError(result.message);
    }
  }

  async function move(id: number, direction: "up" | "down") {
    const result = await request(`/api/gallery/${id}`, "PATCH", {
      move: direction,
    });
    if (!result.ok) setError(result.message);
  }

  async function togglePublished(image: GalleryImageView) {
    const result = await request(`/api/gallery/${image.id}`, "PATCH", {
      isPublished: !image.isPublished,
    });
    if (!result.ok) setError(result.message);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;

    const result = await request(`/api/gallery/${pendingDelete.id}`, "DELETE");
    setPendingDelete(null);
    if (!result.ok) setError(result.message);
  }

  function openNew() {
    setDialogError(null);
    setDraft(blankDraft());
  }

  return (
    <>
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm tracking-[0.25em] text-black/50 uppercase">
            Gallery
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
            Gallery Images
          </h1>
          <p className="mt-3 max-w-xl text-black/60">
            Photos shown between your story and your menu, in this order. The
            first one is displayed largest.
          </p>
        </div>

        {images.length > 0 && (
          <button
            type="button"
            onClick={openNew}
            disabled={working}
            className={primaryButton}
          >
            Add image
          </button>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-red-900/20 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          {error}
        </p>
      )}

      {images.length > 0 && publishedCount === 0 && (
        <p
          role="status"
          className="mt-6 rounded-xl border border-amber-900/25 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          No photos are visible right now, so your website is showing the
          default gallery instead.
        </p>
      )}

      {images.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-black/15 bg-white/40 p-10 text-center">
          <h2 className="text-xl font-medium">No gallery images yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-black/55">
            Add your first photo to replace the default gallery on your website.
            Until then, the demo photos are shown.
          </p>

          <button
            type="button"
            onClick={openNew}
            className={`${primaryButton} mt-6`}
          >
            Add your first image
          </button>
        </div>
      ) : (
        <ul className="mt-10 space-y-4">
          {images.map((image, index) => (
            <li
              key={image.id}
              className="flex flex-col gap-5 rounded-2xl border border-black/10 bg-white/60 p-4 sm:flex-row sm:items-center"
            >
              <div className="relative h-32 w-full shrink-0 overflow-hidden rounded-xl bg-black/5 sm:h-24 sm:w-40">
                <ImagePreview
                  key={image.url}
                  src={image.url}
                  alt={image.alt ?? ""}
                  sizes="(max-width: 640px) 100vw, 10rem"
                  emptyLabel="No image"
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full bg-black/5 px-2.5 py-1 text-xs font-medium">
                    {index + 1}
                    {index === 0 ? " · large" : ""}
                  </span>

                  {!image.isPublished && (
                    <span className="rounded-full bg-black/5 px-2.5 py-1 text-xs text-black/50">
                      Hidden
                    </span>
                  )}
                </div>

                <p className="mt-2 text-sm font-medium">
                  {image.alt ?? (
                    <span className="text-black/40">No alt text</span>
                  )}
                </p>
                <p className="mt-1 truncate text-xs text-black/45">
                  {image.url}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <button
                  type="button"
                  aria-label={`Move image ${index + 1} up`}
                  onClick={() => move(image.id, "up")}
                  disabled={working || index === 0}
                  className={iconButton}
                >
                  ↑
                </button>

                <button
                  type="button"
                  aria-label={`Move image ${index + 1} down`}
                  onClick={() => move(image.id, "down")}
                  disabled={working || index === images.length - 1}
                  className={iconButton}
                >
                  ↓
                </button>

                <button
                  type="button"
                  onClick={() => togglePublished(image)}
                  disabled={working}
                  className={ghostButton}
                >
                  {image.isPublished ? "Hide" : "Show"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDialogError(null);
                    setDraft({
                      id: image.id,
                      url: image.url,
                      alt: image.alt ?? "",
                      isPublished: image.isPublished,
                    });
                  }}
                  disabled={working}
                  className={ghostButton}
                >
                  Edit
                </button>

                <button
                  type="button"
                  onClick={() => setPendingDelete(image)}
                  disabled={working}
                  className={ghostButton}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ImageDialog
        draft={draft}
        busy={working}
        error={dialogError}
        onChange={setDraft}
        onSubmit={handleSave}
        onCancel={() => {
          setDraft(null);
          setDialogError(null);
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete gallery image"
        message="This photo will be permanently removed from your gallery. This cannot be undone."
        confirmLabel="Delete"
        busy={working}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
