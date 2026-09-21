import type { cafes } from "@/app/db/schema";
import type { Cafe } from "@/app/data/cafe";
import { isNonEmptyString } from "@/app/lib/json";

// Row shape returned by Drizzle for the `cafes` table.
export type DbCafe = typeof cafes.$inferSelect;

function pickString(value: unknown, fallback: string): string {
  return isNonEmptyString(value) ? value : fallback;
}

function pickNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Parse a Postgres array-literal string, e.g. `{"24 Market Street",London}`,
 * into its elements. Returns null if `value` isn't wrapped in `{}`.
 * Some drivers write `text[]`-shaped values this way when a JS array is
 * passed straight into a `text` column.
 */
function parsePostgresArrayLiteral(value: string): string[] | null {
  if (!(value.startsWith("{") && value.endsWith("}"))) return null;

  const inner = value.slice(1, -1);
  if (inner.length === 0) return [];

  const items: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < inner.length; i++) {
    const char = inner[i];

    if (char === '"' && inner[i - 1] !== "\\") {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      items.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  items.push(current.trim());
  return items;
}

/**
 * List columns (`address`, `gallery_images`, `hours`) are stored as `text`,
 * and have historically held plain strings, JSON-array strings, Postgres
 * array literals, and (via some drivers) real arrays. Normalize any of those
 * into a clean string[], falling back to static demo data when the value is
 * missing or unusable.
 */
export function normalizeStringList(
  value: unknown,
  fallback: string[],
): string[] {
  if (Array.isArray(value)) {
    const lines = value.filter(isNonEmptyString);
    return lines.length > 0 ? lines : fallback;
  }

  if (isNonEmptyString(value)) {
    const trimmed = value.trim();

    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          const lines = parsed.filter(isNonEmptyString);
          return lines.length > 0 ? lines : fallback;
        }
      } catch {
        // Not valid JSON — fall through and try other formats.
      }
    }

    if (trimmed.startsWith("{")) {
      const parsed = parsePostgresArrayLiteral(trimmed);
      if (parsed) {
        const lines = parsed.filter(isNonEmptyString);
        if (lines.length > 0) return lines;
      }
    }

    return [trimmed];
  }

  return fallback;
}

/** Encode a string[] for storage in a text list column. */
export function serializeStringList(lines: string[]): string {
  return JSON.stringify(lines);
}

/**
 * Merge database café data with static fallback/demo data.
 * Editable fields come from the database when usable; menu items still come
 * from the fallback here (the public page overlays the database menu
 * separately via toPublicMenu).
 */
export function getSiteCafe(dbCafe: DbCafe | undefined, fallback: Cafe): Cafe {
  if (!dbCafe) return fallback;

  return {
    ...fallback,
    name: pickString(dbCafe.name, fallback.name),
    foundedYear: pickNumber(dbCafe.foundedYear, fallback.foundedYear),
    tagline: pickString(dbCafe.tagline, fallback.tagline),
    story: pickString(dbCafe.story, fallback.story),
    storySecondary: pickString(dbCafe.storySecondary, fallback.storySecondary),
    whatsapp: pickString(dbCafe.whatsapp, fallback.whatsapp),
    phone: pickString(dbCafe.phone, fallback.phone),
    instagram: pickString(dbCafe.instagram, fallback.instagram),
    mapsUrl: pickString(dbCafe.mapsUrl, fallback.mapsUrl),
    address: normalizeStringList(dbCafe.address, fallback.address),
    heroImage: pickString(dbCafe.heroImage, fallback.heroImage),
    galleryImages: normalizeStringList(
      dbCafe.galleryImages,
      fallback.galleryImages,
    ),
    hours: normalizeStringList(dbCafe.hours, fallback.hours),
  };
}
