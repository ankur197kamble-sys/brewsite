import { eq } from "drizzle-orm";
import { db } from "@/app/db";
import { cafes } from "@/app/db/schema";
import { normalizeStringList, serializeStringList } from "@/app/lib/site-cafe";
import { parseImageUrl } from "@/app/lib/image-hosts";
import { cafe as fallbackCafe } from "@/app/data/cafe";
import { getCafeSession } from "@/app/lib/session";
import { apiError, apiSuccess, readJsonBody } from "@/app/lib/api-response";
import { asRecord, isNonEmptyString } from "@/app/lib/json";

const MAX_GALLERY_IMAGES = 3;
const MAX_HOURS_LINES = 10;
const MAX_HOURS_LINE_LENGTH = 80;

function optionalText(value: unknown): string | null {
  return isNonEmptyString(value) ? value.trim() : null;
}

type ListResult = { ok: true; value: string[] } | { ok: false; error: string };

/**
 * Gallery URLs: at most three, each one an allowed image host, and no
 * duplicates (the public gallery keys its tiles by URL).
 */
function parseGalleryImages(value: unknown): ListResult {
  if (value === null || value === undefined) return { ok: true, value: [] };
  if (!Array.isArray(value)) {
    return { ok: false, error: "Gallery images must be a list of URLs" };
  }

  if (value.length > MAX_GALLERY_IMAGES) {
    return {
      ok: false,
      error: `You can set at most ${MAX_GALLERY_IMAGES} gallery images`,
    };
  }

  const urls: string[] = [];

  for (const [index, entry] of value.entries()) {
    const parsed = parseImageUrl(entry, `Gallery image ${index + 1}`);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    if (parsed.value === null) continue;

    if (urls.includes(parsed.value)) {
      return { ok: false, error: "Each gallery image must be different" };
    }

    urls.push(parsed.value);
  }

  return { ok: true, value: urls };
}

/** Opening hours: one short line per row, blank rows dropped. */
function parseHours(value: unknown): ListResult {
  if (value === null || value === undefined) return { ok: true, value: [] };
  if (!Array.isArray(value)) {
    return { ok: false, error: "Opening hours must be a list of lines" };
  }

  const lines: string[] = [];

  for (const entry of value) {
    if (typeof entry !== "string") {
      return { ok: false, error: "Opening hours must be text" };
    }

    const trimmed = entry.trim();
    if (trimmed.length === 0) continue;

    if (trimmed.length > MAX_HOURS_LINE_LENGTH) {
      return {
        ok: false,
        error: `Each opening hours line must be under ${MAX_HOURS_LINE_LENGTH} characters`,
      };
    }

    lines.push(trimmed);
  }

  if (lines.length > MAX_HOURS_LINES) {
    return {
      ok: false,
      error: `You can set at most ${MAX_HOURS_LINES} opening hours lines`,
    };
  }

  return { ok: true, value: lines };
}

export async function POST(request: Request) {
  try {
    const session = await getCafeSession();
    if (!session) return apiError("Authentication required", 401);

    const data = asRecord(await readJsonBody(request));
    if (!data) return apiError("Invalid request body", 400);

    if (!isNonEmptyString(data.name)) {
      return apiError("Café name is required", 400);
    }

    const foundedYear =
      typeof data.foundedYear === "number" && Number.isFinite(data.foundedYear)
        ? data.foundedYear
        : null;

    const addressLines = normalizeStringList(
      data.address,
      fallbackCafe.address,
    );

    const heroImage = parseImageUrl(data.heroImage, "Hero image");
    if (!heroImage.ok) return apiError(heroImage.error, 400);

    // The gallery moved to its own table and /dashboard/gallery. This legacy
    // column is still read as a fallback, so only touch it when the caller
    // actually sends the field — an omitted field must never wipe it.
    const managesGallery = data.galleryImages !== undefined;
    const galleryImages = parseGalleryImages(data.galleryImages);
    if (!galleryImages.ok) return apiError(galleryImages.error, 400);

    const hours = parseHours(data.hours);
    if (!hours.ok) return apiError(hours.error, 400);

    const [cafe] = await db
      .update(cafes)
      .set({
        name: data.name.trim(),
        foundedYear,
        tagline: optionalText(data.tagline),
        story: optionalText(data.story),
        storySecondary: optionalText(data.storySecondary),
        whatsapp: optionalText(data.whatsapp),
        phone: optionalText(data.phone),
        instagram: optionalText(data.instagram),
        mapsUrl: optionalText(data.mapsUrl),
        address: serializeStringList(addressLines),
        heroImage: heroImage.value,
        // Empty means "fall back to the demo gallery/hours" on the public site.
        ...(managesGallery
          ? {
              galleryImages:
                galleryImages.value.length > 0
                  ? serializeStringList(galleryImages.value)
                  : null,
            }
          : {}),
        hours: hours.value.length > 0 ? serializeStringList(hours.value) : null,
      })
      .where(eq(cafes.id, session.cafeId))
      .returning();

    if (!cafe) return apiError("Café not found", 404);

    return apiSuccess(cafe);
  } catch (error) {
    console.error("Failed to save café:", error);
    return apiError("Failed to save café information", 500);
  }
}

export async function GET() {
  try {
    const session = await getCafeSession();
    if (!session) return apiError("Authentication required", 401);

    const [cafe] = await db
      .select()
      .from(cafes)
      .where(eq(cafes.id, session.cafeId))
      .limit(1);

    if (!cafe) return apiError("Café not found", 404);

    return apiSuccess(cafe);
  } catch (error) {
    console.error("Failed to fetch café:", error);
    return apiError("Failed to fetch café information", 500);
  }
}
