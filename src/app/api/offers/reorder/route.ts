import { reorderOffers } from "@/app/db/offers";
import { getCafeSession } from "@/app/lib/session";
import { validateReorderIds } from "@/app/lib/offers";
import { apiError, apiSuccess, readJsonBody } from "@/app/lib/api-response";

/**
 * Applies an explicit offer order: `{ ids: [3, 1, 2] }`.
 *
 * The list must be exactly this café's offers. An id belonging to another café
 * is reported as not found, so this cannot be used to probe for or reorder
 * another tenant's rows.
 */
export async function PATCH(request: Request) {
  try {
    const session = await getCafeSession();
    if (!session) return apiError("Authentication required", 401);

    const parsed = validateReorderIds(await readJsonBody(request));
    if (!parsed.ok) return apiError(parsed.error, 400);

    const result = await reorderOffers(session.cafeId, parsed.value);

    if (result.status === "unknown_id") {
      return apiError("Offer not found", 404);
    }

    if (result.status === "incomplete") {
      return apiError("ids must list every offer exactly once", 400);
    }

    return apiSuccess({ reordered: true });
  } catch (error) {
    console.error("Failed to reorder offers:", error);
    return apiError("Failed to reorder offers", 500);
  }
}
