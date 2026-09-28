"use client";

import Image from "next/image";
import { useState } from "react";

type Props = {
  src: string | null;
  alt: string;
  sizes: string;
  /** Shown when there is no URL yet. */
  emptyLabel: string;
};

/**
 * Image preview that degrades instead of breaking.
 *
 * A URL can pass host validation and still fail to load — wrong path, deleted
 * photo, network error. Rather than leaving a broken tile, this swaps in a
 * readable message. Remount with `key={src}` to retry a changed URL.
 */
export function ImagePreview({ src, alt, sizes, emptyLabel }: Props) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <p className="flex h-full items-center justify-center px-4 text-center text-sm text-black/40">
        {failed ? "This image could not be loaded" : emptyLabel}
      </p>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      className="object-cover"
      onError={() => setFailed(true)}
    />
  );
}
