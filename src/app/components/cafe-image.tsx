"use client";

import Image, { type ImageLoader, type ImageProps } from "next/image";
import { UNSPLASH_HOST } from "@/app/lib/image-hosts";

/**
 * Asks Unsplash (imgix) for the exact width the browser needs, in a modern
 * format, so pasted links are as light as uploaded photos without going
 * through our own `/_next/image`. Other parameters the owner's link carries,
 * such as a crop, are kept.
 */
const unsplashLoader: ImageLoader = ({ src, width, quality }) => {
  const url = new URL(src);
  url.searchParams.set("w", String(width));
  url.searchParams.set("q", String(quality ?? 75));
  url.searchParams.set("auto", "format");
  if (!url.searchParams.has("fit")) url.searchParams.set("fit", "max");
  return url.toString();
};

/** One loader per pasted-link host in ALLOWED_IMAGE_HOSTS. */
const PASTED_LINK_LOADERS: Record<string, ImageLoader> = {
  [UNSPLASH_HOST]: unsplashLoader,
};

function pastedLinkLoader(src: ImageProps["src"]): ImageLoader | undefined {
  if (typeof src !== "string") return undefined;
  try {
    return PASTED_LINK_LOADERS[new URL(src).hostname];
  } catch {
    return undefined;
  }
}

/**
 * `next/image` for café photos: a pasted Unsplash link is resized by Unsplash,
 * an uploaded photo by `/_next/image`. See src/app/lib/image-hosts.ts.
 */
export function CafeImage({ alt, ...props }: ImageProps) {
  const loader = pastedLinkLoader(props.src);
  return <Image alt={alt} {...props} {...(loader ? { loader } : {})} />;
}
