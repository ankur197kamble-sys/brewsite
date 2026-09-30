"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { uploadsEnabled } from "@/app/lib/image-hosts";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_DIMENSION } from "@/app/lib/uploads";

type Props = {
  /** Receives the public URL of the stored photo. */
  onUploaded: (url: string) => void;
  /** Lets the form block saving while a photo is still on its way. */
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
  /** Names the field this photo is for, e.g. "hero image". */
  label: string;
};

type Stage = "idle" | "preparing" | "uploading";

/**
 * Re-encodes a photo in the browser before upload: downsized to
 * MAX_UPLOAD_DIMENSION on its longest edge and saved as WebP (JPEG where the
 * browser cannot encode WebP, e.g. Safari). This keeps phone photos well
 * under the request size limit and strips EXIF data such as GPS location,
 * so a café never publishes where a photo was taken by accident.
 */
async function preparePhoto(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      "This file could not be read as a photo. Try a JPEG or PNG.",
    );
  }

  const scale = Math.min(
    1,
    MAX_UPLOAD_DIMENSION / Math.max(bitmap.width, bitmap.height),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Your browser could not prepare this photo.");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const encode = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, quality),
    );

  // A browser that cannot encode WebP silently returns PNG, which is far too
  // large for photos — fall back to JPEG instead.
  let blob = await encode("image/webp", 0.85);
  if (!blob || blob.type !== "image/webp") {
    // JPEG has no transparency: without a backdrop, transparent pixels
    // (a PNG logo, say) would turn black. Paint white behind the image.
    context.globalCompositeOperation = "destination-over";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = "source-over";

    blob = await encode("image/jpeg", 0.85);
    if (blob && blob.size > MAX_UPLOAD_BYTES) {
      blob = await encode("image/jpeg", 0.7);
    }
  }

  if (!blob) throw new Error("Your browser could not prepare this photo.");
  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new Error("This photo is too large even after resizing.");
  }
  return blob;
}

function errorMessage(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const { message } = payload as { message?: unknown };
  return typeof message === "string" ? message : null;
}

/**
 * "Upload photo" control that sits beside an image URL field. Renders nothing
 * when uploads are not configured, leaving the paste-a-link field on its own.
 */
export function ImageUpload({
  onUploaded,
  onBusyChange,
  disabled = false,
  label,
}: Props) {
  const statusId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Keep the latest callbacks without restarting an upload in flight.
  const onUploadedRef = useRef(onUploaded);
  const onBusyChangeRef = useRef(onBusyChange);
  useEffect(() => {
    onUploadedRef.current = onUploaded;
    onBusyChangeRef.current = onBusyChange;
  });

  // Closing the dialog (unmounting) abandons the upload, so a late result can
  // never land in a form that has since closed or moved on to another item.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      onBusyChangeRef.current?.(false);
    },
    [],
  );

  if (!uploadsEnabled) return null;

  const busy = stage !== "idle";

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so choosing the same file again still fires a change event.
    event.target.value = "";
    if (!file) return;

    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    setError(null);
    setDone(false);
    onBusyChangeRef.current?.(true);

    try {
      setStage("preparing");
      const photo = await preparePhoto(file);
      if (signal.aborted) return;

      setStage("uploading");
      const body = new FormData();
      body.append("file", photo, "photo");

      const response = await fetch("/api/uploads", {
        method: "POST",
        body,
        signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (signal.aborted) return;

      if (!response.ok) {
        setError(errorMessage(payload) ?? "Upload failed. Please try again.");
        return;
      }

      const url = (payload as { data?: { url?: unknown } } | null)?.data?.url;
      if (typeof url !== "string") {
        setError("Upload failed. Please try again.");
        return;
      }

      onUploadedRef.current(url);
      setDone(true);
    } catch (caught) {
      if (signal.aborted) return;
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : "Network error. Please try again.",
      );
    } finally {
      if (!signal.aborted) {
        setStage("idle");
        onBusyChangeRef.current?.(false);
      }
    }
  }

  return (
    <div className="mt-3">
      {/* Opened only through the button below, so hidden from assistive
          technology and the tab order to avoid a duplicate, unlabelled control. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        onChange={handleChange}
        disabled={disabled || busy}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || busy}
        aria-describedby={statusId}
        className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {stage === "preparing"
          ? "Preparing photo..."
          : stage === "uploading"
            ? "Uploading..."
            : "Upload photo"}
        <span className="sr-only"> for the {label}</span>
      </button>

      <p
        id={statusId}
        role={error ? "alert" : "status"}
        className={error ? "mt-2 text-xs text-red-900" : "sr-only"}
      >
        {error ??
          (busy
            ? "Uploading photo"
            : done
              ? `Photo uploaded for the ${label}.`
              : "")}
      </p>
    </div>
  );
}
