import { getLoyaltyCard } from "@/app/db/orders";
import { getCafeSession } from "@/app/lib/session";
import { normalizeIndianMobile } from "@/app/lib/orders";
import { apiError, apiSuccess } from "@/app/lib/api-response";

/** Staff look-up of a customer's stamps: `?phone=98765 43210`. */
export async function GET(request: Request) {
  try {
    const session = await getCafeSession();
    if (!session) return apiError("Authentication required", 401);

    const phone = normalizeIndianMobile(new URL(request.url).searchParams.get("phone"));
    if (!phone) return apiError("Enter a valid 10-digit mobile number", 400);
    return apiSuccess(await getLoyaltyCard(session.cafeId, phone));
  } catch (error) {
    console.error("Failed to load loyalty card:", error);
    return apiError("Failed to load loyalty card", 500);
  }
}
