import type { cafes } from "@/app/db/schema";
import type { Cafe } from "@/app/data/cafe";
import { isNonEmptyString, normalizeStringList } from "@/app/lib/json";

// Re-exported so existing importers of these helpers keep working.
export { normalizeStringList, serializeStringList } from "@/app/lib/json";

// Row shape returned by Drizzle for the `cafes` table.
export type DbCafe = typeof cafes.$inferSelect;

/**
 * What the public site renders. Factual fields are nullable or may be empty:
 * a real café must never be shown someone else's hours, phone or address.
 */
export type SiteCafe = Omit<
  Cafe,
  "foundedYear" | "highlights" | "whatsapp" | "phone" | "instagram" | "mapsUrl"
> & {
  foundedYear: number | null;
  highlights: string | null;
  whatsapp: string | null;
  phone: string | null;
  instagram: string | null;
  mapsUrl: string | null;
};

function pickString(value: unknown, fallback: string): string {
  return isNonEmptyString(value) ? value : fallback;
}

function optionalString(value: unknown): string | null {
  return isNonEmptyString(value) ? value.trim() : null;
}

function optionalYear(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

/**
 * Merge database café data with static demo data.
 *
 * Without a database row (or when the database is unreachable) the whole demo
 * café is shown, so the page never breaks. With a row, only presentational
 * fields — tagline, story, hero and gallery photos — fall back to demo
 * content while the café fills them in. Factual fields (founding year,
 * address, hours, phone, WhatsApp, Instagram, maps) come from the row alone;
 * when empty they are hidden, never filled with demo values.
 *
 * Menu items still come from the fallback here; the public page overlays the
 * database menu separately via toPublicMenu.
 */
export function getSiteCafe(
  dbCafe: DbCafe | undefined,
  fallback: Cafe,
): SiteCafe {
  if (!dbCafe) return fallback;

  return {
    ...fallback,
    name: pickString(dbCafe.name, fallback.name),
    foundedYear: optionalYear(dbCafe.foundedYear),
    highlights: optionalString(dbCafe.highlights),
    tagline: pickString(dbCafe.tagline, fallback.tagline),
    story: pickString(dbCafe.story, fallback.story),
    storySecondary: pickString(dbCafe.storySecondary, fallback.storySecondary),
    whatsapp: optionalString(dbCafe.whatsapp),
    phone: optionalString(dbCafe.phone),
    instagram: optionalString(dbCafe.instagram),
    mapsUrl: optionalString(dbCafe.mapsUrl),
    address: normalizeStringList(dbCafe.address, []),
    heroImage: pickString(dbCafe.heroImage, fallback.heroImage),
    galleryImages: normalizeStringList(
      dbCafe.galleryImages,
      fallback.galleryImages,
    ),
    hours: normalizeStringList(dbCafe.hours, []),
  };
}

/** `tel:` target from a display number such as "+91 98765 43210". */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/** wa.me expects the full number as digits only, e.g. "919876543210". */
export function whatsappHref(whatsapp: string): string {
  return `https://wa.me/${whatsapp.replace(/\D/g, "")}`;
}
