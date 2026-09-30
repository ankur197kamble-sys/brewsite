import { deleteOffer, getOffer, moveOffer, updateOffer } from "@/app/db/offers";
import { getCafeSession } from "@/app/lib/session";
import { datesAreOrdered, validateOfferPatch } from "@/app/lib/offers";
import { parseId, parseMoveDirection } from "@/app/lib/validation";
import { apiError, apiSuccess, readJsonBody } from "@/app/lib/api-response";

type Context = { params: Promise<{ id: string }> };

/**
 * Accepts either a partial field update or a reorder
 * (`{ move: "up" | "down" }`), matching the menu and gallery routes.
 */
export async function PATCH(request: Request, context: Context) {
  try {
    const session = await getCafeSession();
    if (!session) return apiError("Authentication required", 401);

    const offerId = parseId((await context.params).id);
    if (offerId === null) return apiError("Invalid offer id", 400);

    const cafeId = session.cafeId;
    const body = await readJsonBody(request);

    const move = parseMoveDirection(body);
    if (move) {
      const moved = await moveOffer(cafeId, offerId, move);
      if (moved === "not_found") return apiError("Offer not found", 404);
      if (moved === "edge") return apiError("Offer cannot move further", 400);
      if (moved === "conflict") {
        return apiError("Your offers changed. Please refresh and try again.", 409);
      }
      return apiSuccess({ moved: true });
    }

    const parsed = validateOfferPatch(body);
    if (!parsed.ok) return apiError(parsed.error, 400);

    // A patch may move only one date bound, so the resulting pair — not just
    // the submitted fields — has to stay in order.
    const existing = await getOffer(cafeId, offerId);
    if (!existing) return apiError("Offer not found", 404);

    const startDate =
      parsed.value.startDate !== undefined
        ? parsed.value.startDate
        : existing.startDate;
    const endDate =
      parsed.value.endDate !== undefined
        ? parsed.value.endDate
        : existing.endDate;

    if (!datesAreOrdered(startDate, endDate)) {
      return apiError("End date cannot be before the start date", 400);
    }

    const offer = await updateOffer(cafeId, offerId, parsed.value);
    if (!offer) return apiError("Offer not found", 404);

    return apiSuccess(offer);
  } catch (error) {
    console.error("Failed to update offer:", error);
    return apiError("Failed to update offer", 500);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const session = await getCafeSession();
    if (!session) return apiError("Authentication required", 401);

    const offerId = parseId((await context.params).id);
    if (offerId === null) return apiError("Invalid offer id", 400);

    const deleted = await deleteOffer(session.cafeId, offerId);
    if (!deleted) return apiError("Offer not found", 404);

    return apiSuccess({ deleted: true });
  } catch (error) {
    console.error("Failed to delete offer:", error);
    return apiError("Failed to delete offer", 500);
  }
}
