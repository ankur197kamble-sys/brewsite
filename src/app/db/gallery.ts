import { and, asc, eq } from "drizzle-orm";
import { db } from "@/app/db";
import { galleryImages, type GalleryImageRow } from "@/app/db/schema";
import type { GalleryImageInput, GalleryImageView } from "@/app/lib/gallery";
import type { MoveDirection, MoveResult } from "@/app/lib/validation";

/**
 * Every function takes an explicit cafeId and filters on it, exactly like the
 * menu data layer. Tenant isolation lives here so no route or page can read or
 * write another café's gallery, whatever the client sends.
 */

function toView(row: GalleryImageRow): GalleryImageView {
  return {
    id: row.id,
    url: row.url,
    alt: row.alt,
    sortOrder: row.sortOrder,
    isPublished: row.isPublished,
  };
}

export async function getGallery(cafeId: number): Promise<GalleryImageView[]> {
  const rows = await db
    .select()
    .from(galleryImages)
    .where(eq(galleryImages.cafeId, cafeId))
    .orderBy(asc(galleryImages.sortOrder), asc(galleryImages.id));

  return rows.map(toView);
}

/** Public-site read: only what the café has chosen to show. */
export async function getPublishedGallery(
  cafeId: number,
): Promise<GalleryImageView[]> {
  const rows = await db
    .select()
    .from(galleryImages)
    .where(
      and(
        eq(galleryImages.cafeId, cafeId),
        eq(galleryImages.isPublished, true),
      ),
    )
    .orderBy(asc(galleryImages.sortOrder), asc(galleryImages.id));

  return rows.map(toView);
}

/** Single image, still scoped to the café that owns it. */
export async function getGalleryImage(
  cafeId: number,
  imageId: number,
): Promise<GalleryImageView | undefined> {
  const [row] = await db
    .select()
    .from(galleryImages)
    .where(and(eq(galleryImages.cafeId, cafeId), eq(galleryImages.id, imageId)))
    .limit(1);

  return row ? toView(row) : undefined;
}

async function nextSortOrder(cafeId: number): Promise<number> {
  const rows = await db
    .select({ sortOrder: galleryImages.sortOrder })
    .from(galleryImages)
    .where(eq(galleryImages.cafeId, cafeId));

  return rows.reduce((max, row) => Math.max(max, row.sortOrder + 1), 0);
}

export async function createGalleryImage(
  cafeId: number,
  input: GalleryImageInput,
): Promise<GalleryImageView> {
  const [row] = await db
    .insert(galleryImages)
    .values({
      cafeId,
      url: input.url,
      alt: input.alt,
      isPublished: input.isPublished,
      sortOrder: await nextSortOrder(cafeId),
    })
    .returning();

  return toView(row);
}

export async function updateGalleryImage(
  cafeId: number,
  imageId: number,
  patch: Partial<GalleryImageInput>,
): Promise<GalleryImageView | undefined> {
  const [row] = await db
    .update(galleryImages)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(galleryImages.cafeId, cafeId), eq(galleryImages.id, imageId)))
    .returning();

  return row ? toView(row) : undefined;
}

export async function deleteGalleryImage(
  cafeId: number,
  imageId: number,
): Promise<boolean> {
  const [row] = await db
    .delete(galleryImages)
    .where(and(eq(galleryImages.cafeId, cafeId), eq(galleryImages.id, imageId)))
    .returning({ id: galleryImages.id });

  return Boolean(row);
}

export type ReorderResult =
  { status: "ok" } | { status: "unknown_id" } | { status: "incomplete" };

/**
 * Applies an explicit order. The submitted list must be exactly this café's
 * images: any id belonging to another café simply is not in the set, so a
 * foreign id can never be written, and a partial list is rejected rather than
 * silently leaving gaps.
 */
export async function reorderGallery(
  cafeId: number,
  orderedIds: number[],
): Promise<ReorderResult> {
  const current = await db
    .select({ id: galleryImages.id, sortOrder: galleryImages.sortOrder })
    .from(galleryImages)
    .where(eq(galleryImages.cafeId, cafeId))
    .orderBy(asc(galleryImages.sortOrder), asc(galleryImages.id));

  const owned = new Set(current.map((row) => row.id));
  const submitted = new Set(orderedIds);

  if (submitted.size !== orderedIds.length) return { status: "incomplete" };
  if (orderedIds.some((id) => !owned.has(id))) return { status: "unknown_id" };
  if (orderedIds.length !== current.length) return { status: "incomplete" };

  const sortOrderById = new Map(current.map((row) => [row.id, row.sortOrder]));

  await Promise.all(
    orderedIds
      .map((id, position) => ({ id, position }))
      .filter(({ id, position }) => sortOrderById.get(id) !== position)
      .map(({ id, position }) =>
        db
          .update(galleryImages)
          .set({ sortOrder: position, updatedAt: new Date() })
          .where(
            and(eq(galleryImages.cafeId, cafeId), eq(galleryImages.id, id)),
          ),
      ),
  );

  return { status: "ok" };
}

/**
 * Nudges one image past its neighbour. Builds the resulting order and hands it
 * to reorderGallery, so there is a single implementation of the write.
 */
export async function moveGalleryImage(
  cafeId: number,
  imageId: number,
  direction: MoveDirection,
): Promise<MoveResult> {
  const current = await db
    .select({ id: galleryImages.id })
    .from(galleryImages)
    .where(eq(galleryImages.cafeId, cafeId))
    .orderBy(asc(galleryImages.sortOrder), asc(galleryImages.id));

  const ids = current.map((row) => row.id);
  const index = ids.indexOf(imageId);
  if (index === -1) return "not_found";

  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= ids.length) return "edge";

  [ids[index], ids[target]] = [ids[target], ids[index]];

  const result = await reorderGallery(cafeId, ids);
  return result.status === "ok" ? "moved" : "conflict";
}
