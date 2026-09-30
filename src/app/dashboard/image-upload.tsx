"use client";

import { useId, useRef, useState, type ChangeEvent } from "react";
import { uploadsEnabled } from "@/app/lib/image-hosts";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_DIMENSION } from "@/app/lib/uploads";

type Props = {
  /** Receives the public URL of the stored photo. */
  onUploaded: (url: string) => void;
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
  if (!context) throw new Error("Your browser could not prepare this photo.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const encode = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, quality),
    );

  // A browser that cannot encode WebP silently returns PNG, which is far too
  // large for photos — fall back to JPEG instead.
  let blob = await encode("image/webp", 0.85);
  if (!blob || blob.type !== "image/webp") blob = await encode("image/jpeg", 0.85);
  if (blob && blob.size > MAX_UPLOAD_BYTES) blob = await encode("image/jpeg", 0.7);

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
export function ImageUpload({ onUploaded, disabled = false, label }: Props) {
  const inputId = useId();
  const statusId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);

  if (!uploadsEnabled) return null;

  const busy = stage !== "idle";

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so choosing the same file again still fires a change event.
    event.target.value = "";
    if (!file) return;

    setError(null);

    try {
      setStage("preparing");
      const photo = await preparePhoto(file);

      setStage("uploading");
      const body = new FormData();
      body.append("file", photo, "photo");

      const response = await fetch("/api/uploads", { method: "POST", body });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setError(errorMessage(payload) ?? "Upload failed. Please try again.");
        return;
      }

      const url = (payload as { data?: { url?: unknown } } | null)?.data?.url;
      if (typeof url !== "string") {
        setError("Upload failed. Please try again.");
        return;
      }

      onUploaded(url);
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : "Network error. Please try again.",
      );
    } finally {
      setStage("idle");
    }
  }

  return (
    <div className="mt-3">
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        onChange={handleChange}
        disabled={disabled || busy}
        className="sr-only"
        aria-describedby={statusId}
        tabIndex={-1}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || busy}
        aria-label={`Upload a photo for the ${label}`}
        className="rounded-full border border-black/15 px-4 py-2 text-sm font-medium transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {stage === "preparing"
          ? "Preparing photo..."
          : stage === "uploading"
            ? "Uploading..."
            : "Upload photo"}
      </button>

      <p
        id={statusId}
        role={error ? "alert" : "status"}
        className={error ? "mt-2 text-xs text-red-900" : "sr-only"}
      >
        {error ?? (busy ? "Uploading photo" : "")}
      </p>
    </div>
  );
}
