import type { cafes } from "@/app/db/schema";
import type { Cafe } from "@/app/data/cafe";
import { isNonEmptyString, normalizeStringList } from "@/app/lib/json";

// Re-exported so existing importers of these helpers keep working.
export { normalizeStringList, serializeStringList } from "@/app/lib/json";

// Row shape returned by Drizzle for the `cafes` table.
export type DbCafe = typeof cafes.$inferSelect;

function pickString(value: unknown, fallback: string): string {
  return isNonEmptyString(value) ? value : fallback;
}

function pickNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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
