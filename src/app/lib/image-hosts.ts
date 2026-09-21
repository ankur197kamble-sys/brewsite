/**
 * Hosts the public site is allowed to load images from.
 *
 * This is the single source of truth for two things that must never drift
 * apart: `next.config.ts` image `remotePatterns` (what `next/image` will
 * render) and API validation (what an owner is allowed to save). If they
 * diverge, a café can save a URL that renders as a broken image.
 *
 * Widening this to every host would turn `/_next/image` into an open image
 * proxy for anyone on the internet, so hosts are added deliberately. Owner
 * uploads to our own storage will be added here when that ships.
 */
export const ALLOWED_IMAGE_HOSTS = ["images.unsplash.com"] as const;

export function isAllowedImageHost(hostname: string): boolean {
  return (ALLOWED_IMAGE_HOSTS as readonly string[]).includes(hostname);
}

export type ImageUrlResult =
  { ok: true; value: string | null } | { ok: false; error: string };

/**
 * Validates an optional image URL: https/http only, and only from a host the
 * renderer can actually display. Empty input resolves to null.
 */
export function parseImageUrl(value: unknown, label: string): ImageUrlResult {
  if (value === null || value === undefined) return { ok: true, value: null };

  if (typeof value !== "string") {
    return { ok: false, error: `${label} must be a URL` };
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > 2048)
    return { ok: false, error: `${label} is too long` };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: `${label} must be a valid URL` };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: `${label} must be an http(s) URL` };
  }

  if (!isAllowedImageHost(url.hostname)) {
    return {
      ok: false,
      error: `${label} must be hosted on ${ALLOWED_IMAGE_HOSTS.join(" or ")}`,
    };
  }

  return { ok: true, value: url.toString() };
}
