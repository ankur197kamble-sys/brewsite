import { and, asc, eq } from "drizzle-orm";
import { db } from "@/app/db";
import { offers, type OfferRow } from "@/app/db/schema";
import type { OfferInput, OfferView } from "@/app/lib/offers";

/**
 * Every function takes an explicit cafeId and filters on it, exactly like the
 * menu and gallery layers. Tenant isolation lives here, so no route or page
 * can read or write another café's offers whatever the client sends.
 */

function toView(row: OfferRow): OfferView {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    imageUrl: row.imageUrl,
    value: row.value,
    startDate: row.startDate,
    endDate: row.endDate,
    isPublished: row.isPublished,
    sortOrder: row.sortOrder,
  };
}

/** Deterministic order: sortOrder, then id as a stable tie-break. */
export async function getOffers(cafeId: number): Promise<OfferView[]> {
  const rows = await db
    .select()
    .from(offers)
    .where(eq(offers.cafeId, cafeId))
    .orderBy(asc(offers.sortOrder), asc(offers.id));

  return rows.map(toView);
}

/**
 * Published rows only. Date filtering stays in `toPublicOffers` so the "live"
 * rule has exactly one definition, shared with the dashboard badges.
 */
export async function getPublishedOffers(cafeId: number): Promise<OfferView[]> {
  const rows = await db
    .select()
    .from(offers)
    .where(and(eq(offers.cafeId, cafeId), eq(offers.isPublished, true)))
    .orderBy(asc(offers.sortOrder), asc(offers.id));

  return rows.map(toView);
}

export async function getOffer(
  cafeId: number,
  offerId: number,
): Promise<OfferView | undefined> {
  const [row] = await db
    .select()
    .from(offers)
    .where(and(eq(offers.cafeId, cafeId), eq(offers.id, offerId)))
    .limit(1);

  return row ? toView(row) : undefined;
}

async function nextSortOrder(cafeId: number): Promise<number> {
  const rows = await db
    .select({ sortOrder: offers.sortOrder })
    .from(offers)
    .where(eq(offers.cafeId, cafeId));

  return rows.reduce((max, row) => Math.max(max, row.sortOrder + 1), 0);
}

export async function createOffer(
  cafeId: number,
  input: OfferInput,
): Promise<OfferView> {
  const [row] = await db
    .insert(offers)
    .values({
      cafeId,
      title: input.title,
      description: input.description,
      imageUrl: input.imageUrl,
      value: input.value,
      startDate: input.startDate,
      endDate: input.endDate,
      isPublished: input.isPublished,
      sortOrder: await nextSortOrder(cafeId),
    })
    .returning();

  return toView(row);
}

export async function updateOffer(
  cafeId: number,
  offerId: number,
  patch: Partial<OfferInput>,
): Promise<OfferView | undefined> {
  const [row] = await db
    .update(offers)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(offers.cafeId, cafeId), eq(offers.id, offerId)))
    .returning();

  return row ? toView(row) : undefined;
}

export async function deleteOffer(
  cafeId: number,
  offerId: number,
): Promise<boolean> {
  const [row] = await db
    .delete(offers)
    .where(and(eq(offers.cafeId, cafeId), eq(offers.id, offerId)))
    .returning({ id: offers.id });

  return Boolean(row);
}

export type ReorderResult =
  { status: "ok" } | { status: "unknown_id" } | { status: "incomplete" };

/**
 * Applies an explicit order. The submitted list must be exactly this café's
 * offers: an id belonging to another café simply is not in the set, so a
 * foreign id can never be written, and a partial list is rejected rather than
 * silently leaving gaps.
 */
export async function reorderOffers(
  cafeId: number,
  orderedIds: number[],
): Promise<ReorderResult> {
  const current = await db
    .select({ id: offers.id, sortOrder: offers.sortOrder })
    .from(offers)
    .where(eq(offers.cafeId, cafeId))
    .orderBy(asc(offers.sortOrder), asc(offers.id));

  const owned = new Set(current.map((row) => row.id));

  if (new Set(orderedIds).size !== orderedIds.length) {
    return { status: "incomplete" };
  }
  if (orderedIds.some((id) => !owned.has(id))) return { status: "unknown_id" };
  if (orderedIds.length !== current.length) return { status: "incomplete" };

  const sortOrderById = new Map(current.map((row) => [row.id, row.sortOrder]));

  await Promise.all(
    orderedIds
      .map((id, position) => ({ id, position }))
      .filter(({ id, position }) => sortOrderById.get(id) !== position)
      .map(({ id, position }) =>
        db
          .update(offers)
          .set({ sortOrder: position, updatedAt: new Date() })
          .where(and(eq(offers.cafeId, cafeId), eq(offers.id, id))),
      ),
  );

  return { status: "ok" };
}

/**
 * Nudges one offer past its neighbour by building the resulting order and
 * handing it to reorderOffers, so there is a single implementation of the
 * ordering write.
 */
export async function moveOffer(
  cafeId: number,
  offerId: number,
  direction: "up" | "down",
): Promise<boolean> {
  const current = await db
    .select({ id: offers.id })
    .from(offers)
    .where(eq(offers.cafeId, cafeId))
    .orderBy(asc(offers.sortOrder), asc(offers.id));

  const ids = current.map((row) => row.id);
  const index = ids.indexOf(offerId);
  if (index === -1) return false;

  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= ids.length) return false;

  [ids[index], ids[target]] = [ids[target], ids[index]];

  const result = await reorderOffers(cafeId, ids);
  return result.status === "ok";
}
