import { getLoyaltyCard } from "@/app/db/orders";
import { getCafeSession } from "@/app/lib/session";
import { normalizeIndianMobile } from "@/app/lib/orders";
import { asRecord } from "@/app/lib/json";
import { apiError, apiSuccess, readJsonBody } from "@/app/lib/api-response";
import { logError } from "@/app/lib/log";

/**
 * Staff look-up of a customer's stamps: POST { phone }. Sent in the body, not
 * the address, so customers' numbers never appear in request logs.
 */
export async function POST(request: Request) {
  try {
    const session = await getCafeSession();
    if (!session) return apiError("Authentication required", 401);

    const phone = normalizeIndianMobile(asRecord(await readJsonBody(request))?.phone);
    if (!phone) return apiError("Enter a valid 10-digit mobile number", 400);
    return apiSuccess(await getLoyaltyCard(session.cafeId, phone));
  } catch (error) {
    logError("Failed to load loyalty card:", error);
    return apiError("Failed to load loyalty card", 500);
  }
}
