/**
 * Where the public site is allowed to load images from.
 *
 * This is the single source of truth for two things that must never drift
 * apart: `next.config.ts` image `remotePatterns` (what `next/image` will
 * render) and API validation (what an owner is allowed to save). If they
 * diverge, a café can save a URL that renders as a broken image.
 *
 * Widening this to every host would turn `/_next/image` into an open image
 * proxy for anyone on the internet, so sources are added deliberately.
 */

/** External hosts an owner may paste links from. */
export const ALLOWED_IMAGE_HOSTS = ["images.unsplash.com"] as const;

/** Every uploaded object lives under `cafes/<cafeId>/` in the bucket. */
export const UPLOADS_PATH_PREFIX = "/cafes/";

/**
 * Public base URL of the café photo bucket (Cloudflare R2), e.g.
 * `https://pub-….r2.dev` or a custom domain. Not a secret: it is the address
 * visitors load photos from, and client components need it to validate URLs.
 * Unset means uploads are switched off and only pasted links work.
 */
export const UPLOADS_BASE_URL = parseBaseUrl(
  process.env.NEXT_PUBLIC_UPLOADS_BASE_URL,
);

function parseBaseUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export const uploadsEnabled = UPLOADS_BASE_URL !== null;

/**
 * Earlier public hosts of the same bucket, comma-separated, e.g. the r2.dev
 * address used before a custom domain was connected. Photos saved under an
 * old host keep rendering as long as that host still serves the bucket.
 */
const LEGACY_UPLOAD_HOSTS = (process.env.NEXT_PUBLIC_UPLOADS_LEGACY_HOSTS ?? "")
  .split(",")
  .map((value) => parseBaseUrl(value.trim()))
  .filter((origin): origin is string => origin !== null)
  .map((origin) => new URL(origin).hostname);

/**
 * `pathPrefix` and `noQuery` mirror the `pathname` and `search` rules that
 * next.config.ts gives `remotePatterns`, so a URL passes validation exactly
 * when the renderer will display it.
 */
type ImageSource = { hostname: string; pathPrefix?: string; noQuery?: boolean };

/**
 * Pasted-link hosts plus, when configured, the upload bucket restricted to
 * the `/cafes/` prefix with no query string, so the bucket's other paths are
 * never proxied.
 */
export const IMAGE_SOURCES: readonly ImageSource[] = [
  ...ALLOWED_IMAGE_HOSTS.map((hostname) => ({ hostname })),
  ...(UPLOADS_BASE_URL
    ? [new URL(UPLOADS_BASE_URL).hostname, ...LEGACY_UPLOAD_HOSTS].map(
        (hostname) => ({
          hostname,
          pathPrefix: UPLOADS_PATH_PREFIX,
          noQuery: true,
        }),
      )
    : []),
];

/** One-line guidance shown under image fields in the dashboard. */
export const IMAGE_SOURCE_HINT = uploadsEnabled
  ? `Upload a photo, or paste a link from ${ALLOWED_IMAGE_HOSTS.join(" or ")}.`
  : `Paste a link from ${ALLOWED_IMAGE_HOSTS.join(" or ")}.`;

function isAllowedImageUrl(url: URL): boolean {
  return IMAGE_SOURCES.some(
    (source) =>
      source.hostname === url.hostname &&
      (!source.pathPrefix || url.pathname.startsWith(source.pathPrefix)) &&
      (!source.noQuery || url.search === ""),
  );
}

export type ImageUrlResult =
  { ok: true; value: string | null } | { ok: false; error: string };

/**
 * Validates an optional image URL: only from a source the renderer can
 * actually display. The renderer fetches over https only, so an http link is
 * upgraded rather than saved in a form that would never load. Empty input
 * resolves to null.
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

  if (url.protocol === "http:") url.protocol = "https:";
  if (url.protocol !== "https:") {
    return { ok: false, error: `${label} must be an https URL` };
  }

  if (!isAllowedImageUrl(url)) {
    const hosts = ALLOWED_IMAGE_HOSTS.join(" or ");
    return {
      ok: false,
      error: uploadsEnabled
        ? `${label} must be an uploaded photo or a link from ${hosts}`
        : `${label} must be hosted on ${hosts}`,
    };
  }

  return { ok: true, value: url.toString() };
}
