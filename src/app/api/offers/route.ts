import { createOffer, getOffers } from "@/app/db/offers";
import { getCafeSession } from "@/app/lib/session";
import { validateOfferInput } from "@/app/lib/offers";
import { apiError, apiSuccess, readJsonBody } from "@/app/lib/api-response";

export async function GET() {
  try {
    const session = await getCafeSession();
    if (!session) return apiError("Authentication required", 401);

    const offers = await getOffers(session.cafeId);
    return apiSuccess({ offers });
  } catch (error) {
    console.error("Failed to load offers:", error);
    return apiError("Failed to load offers", 500);
  }
}

export async function POST(request: Request) {
  try {
    const session = await getCafeSession();
    if (!session) return apiError("Authentication required", 401);

    const parsed = validateOfferInput(await readJsonBody(request));
    if (!parsed.ok) return apiError(parsed.error, 400);

    // cafeId comes from the session only; any cafeId in the body is ignored.
    const offer = await createOffer(session.cafeId, parsed.value);
    return apiSuccess(offer, 201);
  } catch (error) {
    console.error("Failed to create offer:", error);
    return apiError("Failed to create offer", 500);
  }
}
