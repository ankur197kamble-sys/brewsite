import { asRecord } from "@/app/lib/json";
import { parseImageUrl } from "@/app/lib/image-hosts";
import { invalid, parseId, type Validated } from "@/app/lib/validation";

const MAX_ALT_LENGTH = 200;

export type GalleryImageView = {
  id: number;
  url: string;
  alt: string | null;
  sortOrder: number;
  isPublished: boolean;
};

export type GalleryImageInput = {
  url: string;
  alt: string | null;
  isPublished: boolean;
};

function parseAlt(
  value: unknown,
): { ok: true; value: string | null } | { ok: false } {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false };

  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > MAX_ALT_LENGTH) return { ok: false };

  return { ok: true, value: trimmed };
}

/**
 * Image URLs go through the shared host allowlist in `lib/image-hosts`, the
 * same one `next.config.ts` builds its remotePatterns from — so the dashboard
 * can never save a URL the public renderer would refuse to display.
 */
export function validateGalleryImageInput(
  body: unknown,
): Validated<GalleryImageInput> {
  const record = asRecord(body);
  if (!record) return invalid("Invalid request body");

  const url = parseImageUrl(record.url, "Image URL");
  if (!url.ok) return invalid(url.error);
  if (url.value === null) return invalid("Image URL is required");

  const alt = parseAlt(record.alt);
  if (!alt.ok) {
    return invalid(`Alt text must be under ${MAX_ALT_LENGTH} characters`);
  }

  const isPublished =
    record.isPublished === undefined ? true : record.isPublished === true;

  return { ok: true, value: { url: url.value, alt: alt.value, isPublished } };
}

/** Partial update: only the keys actually present are validated and returned. */
export function validateGalleryImagePatch(
  body: unknown,
): Validated<Partial<GalleryImageInput>> {
  const record = asRecord(body);
  if (!record) return invalid("Invalid request body");

  const patch: Partial<GalleryImageInput> = {};

  if (record.url !== undefined) {
    const url = parseImageUrl(record.url, "Image URL");
    if (!url.ok) return invalid(url.error);
    if (url.value === null) return invalid("Image URL is required");
    patch.url = url.value;
  }

  if (record.alt !== undefined) {
    const alt = parseAlt(record.alt);
    if (!alt.ok) {
      return invalid(`Alt text must be under ${MAX_ALT_LENGTH} characters`);
    }
    patch.alt = alt.value;
  }

  if (record.isPublished !== undefined) {
    if (typeof record.isPublished !== "boolean") {
      return invalid("Published status must be true or false");
    }
    patch.isPublished = record.isPublished;
  }

  if (Object.keys(patch).length === 0) return invalid("Nothing to update");

  return { ok: true, value: patch };
}

/** Guards against an unbounded id list in a reorder request. */
const MAX_REORDER_IDS = 200;

/** Validates `{ ids: [...] }` for a reorder request. */
export function validateReorderIds(body: unknown): Validated<number[]> {
  const record = asRecord(body);
  if (!record) return invalid("Invalid request body");

  const { ids } = record;
  if (!Array.isArray(ids)) return invalid("ids must be an array of image ids");
  if (ids.length === 0) return invalid("ids must not be empty");
  if (ids.length > MAX_REORDER_IDS) return invalid("Too many ids");

  const parsed: number[] = [];
  for (const entry of ids) {
    const id = parseId(entry);
    if (id === null) return invalid("ids must all be valid image ids");
    parsed.push(id);
  }

  if (new Set(parsed).size !== parsed.length) {
    return invalid("ids must not contain duplicates");
  }

  return { ok: true, value: parsed };
}

export type PublicGalleryImage = {
  key: string;
  url: string;
  alt: string;
};

export type PublicGallery = {
  images: PublicGalleryImage[];
  isFallback: boolean;
};

/**
 * What the public site renders.
 *
 * Falls back to the café's legacy image list (which itself falls back to the
 * static demo photos) whenever there is nothing published, so the gallery band
 * is never empty and a new café never ships a broken-looking page.
 */
export function toPublicGallery(
  images: GalleryImageView[],
  fallbackUrls: readonly string[],
  cafeName: string,
): PublicGallery {
  const published = images.filter((image) => image.isPublished);

  if (published.length === 0) {
    return {
      isFallback: true,
      images: fallbackUrls.map((url, index) => ({
        key: `fallback-${index}`,
        url,
        alt: `${cafeName}: atmosphere ${index + 1}`,
      })),
    };
  }

  return {
    isFallback: false,
    images: published.map((image, index) => ({
      key: `image-${image.id}`,
      url: image.url,
      alt: image.alt ?? `${cafeName}: atmosphere ${index + 1}`,
    })),
  };
}
