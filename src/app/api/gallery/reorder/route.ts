import { reorderGallery } from "@/app/db/gallery";
import { getCafeSession } from "@/app/lib/session";
import { validateReorderIds } from "@/app/lib/gallery";
import { apiError, apiSuccess, readJsonBody } from "@/app/lib/api-response";

/**
 * Applies an explicit gallery order: `{ ids: [3, 1, 2] }`.
 *
 * The list must be exactly this café's images. An id belonging to another café
 * is reported as not found, so this cannot be used to probe for or reorder
 * another tenant's rows.
 */
export async function PATCH(request: Request) {
  try {
    const session = await getCafeSession();
    if (!session) return apiError("Authentication required", 401);

    const parsed = validateReorderIds(await readJsonBody(request));
    if (!parsed.ok) return apiError(parsed.error, 400);

    const result = await reorderGallery(session.cafeId, parsed.value);

    if (result.status === "unknown_id") {
      return apiError("Gallery image not found", 404);
    }

    if (result.status === "incomplete") {
      return apiError("ids must list every gallery image exactly once", 400);
    }

    return apiSuccess({ reordered: true });
  } catch (error) {
    console.error("Failed to reorder gallery:", error);
    return apiError("Failed to reorder gallery", 500);
  }
}
