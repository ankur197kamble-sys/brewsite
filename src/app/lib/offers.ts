import { asRecord } from "@/app/lib/json";
import { parseImageUrl } from "@/app/lib/image-hosts";
import { invalid, parseId, type Validated } from "@/app/lib/validation";

const MAX_TITLE_LENGTH = 90;
const MAX_DESCRIPTION_LENGTH = 400;
const MAX_VALUE_LENGTH = 40;
const MAX_REORDER_IDS = 200;

export type OfferView = {
  id: number;
  title: string;
  description: string | null;
  imageUrl: string | null;
  value: string | null;
  startDate: string | null;
  endDate: string | null;
  isPublished: boolean;
  sortOrder: number;
};

export type OfferInput = {
  title: string;
  description: string | null;
  imageUrl: string | null;
  value: string | null;
  startDate: string | null;
  endDate: string | null;
  isPublished: boolean;
};

/* ----------------------------------------------------------------- dates */

/**
 * Offer dates are the café's calendar days, so "today" must be read in the
 * café's time zone rather than the server's — hosts typically run on UTC,
 * which would start and end Indian offers 5½ hours late. Platform default
 * until time zone becomes a per-café setting.
 */
export const CAFE_TIME_ZONE = "Asia/Kolkata";

/** Today's calendar date in the café's time zone, as the columns store it. */
export function today(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CAFE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Strict "YYYY-MM-DD" that also rejects impossible days like 2026-02-31. */
function parseDate(
  value: unknown,
): { ok: true; value: string | null } | { ok: false } {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false };

  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return { ok: false };

  const [year, month, day] = trimmed.split("-").map(Number);
  const asDate = new Date(Date.UTC(year, month - 1, day));
  if (
    asDate.getUTCFullYear() !== year ||
    asDate.getUTCMonth() !== month - 1 ||
    asDate.getUTCDate() !== day
  ) {
    return { ok: false };
  }

  return { ok: true, value: trimmed };
}

/** "2026-10-01" -> "1 Oct 2026". Parsed as UTC so the day never shifts. */
export function formatOfferDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export type OfferStatus = "draft" | "scheduled" | "live" | "ended";

/**
 * The single definition of when an offer is visible.
 *
 * Unpublished is always "draft". Otherwise the optional date bounds decide,
 * both inclusive: an offer with no dates is live forever, one that has not
 * started is "scheduled", one past its end date is "ended". Only "live"
 * offers render publicly, so an expired promotion disappears on its own
 * without the owner having to remember to unpublish it.
 *
 * Dates compare as "YYYY-MM-DD" strings, which sort lexicographically the same
 * way they sort chronologically — no Date maths, no timezone drift.
 */
export function offerStatus(
  offer: Pick<OfferView, "isPublished" | "startDate" | "endDate">,
  now: string = today(),
): OfferStatus {
  if (!offer.isPublished) return "draft";
  if (offer.startDate && offer.startDate > now) return "scheduled";
  if (offer.endDate && offer.endDate < now) return "ended";
  return "live";
}

/* ------------------------------------------------------------ validation */

function parseText(
  value: unknown,
  maxLength: number,
): { ok: true; value: string | null } | { ok: false } {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false };

  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > maxLength) return { ok: false };

  return { ok: true, value: trimmed };
}

/**
 * Reads whichever offer fields are present into `patch`, returning an error
 * message or null. Shared by create and update so both enforce identical
 * rules and there is one place to change them.
 */
function readOfferFields(
  record: Record<string, unknown>,
  patch: Partial<OfferInput>,
): string | null {
  if (record.title !== undefined) {
    const title = parseText(record.title, MAX_TITLE_LENGTH);
    if (!title.ok) return `Title must be under ${MAX_TITLE_LENGTH} characters`;
    if (title.value === null) return "Title is required";
    patch.title = title.value;
  }

  if (record.description !== undefined) {
    const description = parseText(record.description, MAX_DESCRIPTION_LENGTH);
    if (!description.ok) {
      return `Description must be under ${MAX_DESCRIPTION_LENGTH} characters`;
    }
    patch.description = description.value;
  }

  if (record.value !== undefined) {
    const value = parseText(record.value, MAX_VALUE_LENGTH);
    if (!value.ok) {
      return `Offer value must be under ${MAX_VALUE_LENGTH} characters`;
    }
    patch.value = value.value;
  }

  if (record.imageUrl !== undefined) {
    const imageUrl = parseImageUrl(record.imageUrl, "Image URL");
    if (!imageUrl.ok) return imageUrl.error;
    patch.imageUrl = imageUrl.value;
  }

  if (record.startDate !== undefined) {
    const startDate = parseDate(record.startDate);
    if (!startDate.ok) return "Start date must be a real date (YYYY-MM-DD)";
    patch.startDate = startDate.value;
  }

  if (record.endDate !== undefined) {
    const endDate = parseDate(record.endDate);
    if (!endDate.ok) return "End date must be a real date (YYYY-MM-DD)";
    patch.endDate = endDate.value;
  }

  if (record.isPublished !== undefined) {
    if (typeof record.isPublished !== "boolean") {
      return "Published status must be true or false";
    }
    patch.isPublished = record.isPublished;
  }

  return null;
}

/** End date may never precede start date. */
export function datesAreOrdered(
  startDate: string | null,
  endDate: string | null,
): boolean {
  return !(startDate && endDate && endDate < startDate);
}

export function validateOfferInput(body: unknown): Validated<OfferInput> {
  const record = asRecord(body);
  if (!record) return invalid("Invalid request body");

  const patch: Partial<OfferInput> = {};
  const error = readOfferFields(record, patch);
  if (error) return invalid(error);

  if (patch.title === undefined) return invalid("Title is required");

  const value: OfferInput = {
    title: patch.title,
    description: patch.description ?? null,
    imageUrl: patch.imageUrl ?? null,
    value: patch.value ?? null,
    startDate: patch.startDate ?? null,
    endDate: patch.endDate ?? null,
    isPublished: patch.isPublished ?? true,
  };

  if (!datesAreOrdered(value.startDate, value.endDate)) {
    return invalid("End date cannot be before the start date");
  }

  return { ok: true, value };
}

/** Partial update: only the keys actually present are validated and returned. */
export function validateOfferPatch(
  body: unknown,
): Validated<Partial<OfferInput>> {
  const record = asRecord(body);
  if (!record) return invalid("Invalid request body");

  const patch: Partial<OfferInput> = {};
  const error = readOfferFields(record, patch);
  if (error) return invalid(error);

  if (Object.keys(patch).length === 0) return invalid("Nothing to update");

  return { ok: true, value: patch };
}

export function validateReorderIds(body: unknown): Validated<number[]> {
  const record = asRecord(body);
  if (!record) return invalid("Invalid request body");

  const { ids } = record;
  if (!Array.isArray(ids)) return invalid("ids must be an array of offer ids");
  if (ids.length === 0) return invalid("ids must not be empty");
  if (ids.length > MAX_REORDER_IDS) return invalid("Too many ids");

  const parsed: number[] = [];
  for (const entry of ids) {
    const id = parseId(entry);
    if (id === null) return invalid("ids must all be valid offer ids");
    parsed.push(id);
  }

  if (new Set(parsed).size !== parsed.length) {
    return invalid("ids must not contain duplicates");
  }

  return { ok: true, value: parsed };
}

/** Only live offers reach the public site; drafts and expired ones never do. */
export function toPublicOffers(
  offers: OfferView[],
  now: string = today(),
): OfferView[] {
  return offers.filter((offer) => offerStatus(offer, now) === "live");
}
