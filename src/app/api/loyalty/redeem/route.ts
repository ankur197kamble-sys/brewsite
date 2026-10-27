import { redeemReward } from "@/app/db/orders";
import { getCafeSession } from "@/app/lib/session";
import { normalizeIndianMobile } from "@/app/lib/orders";
import { asRecord } from "@/app/lib/json";
import { apiError, apiSuccess, readJsonBody } from "@/app/lib/api-response";
import { logError } from "@/app/lib/log";

/** Staff redeem one reward for `{ phone }`, only if one is available. */
export async function POST(request: Request) {
  try {
    const session = await getCafeSession();
    if (!session) return apiError("Authentication required", 401);

    const phone = normalizeIndianMobile(asRecord(await readJsonBody(request))?.phone);
    if (!phone) return apiError("Enter a valid 10-digit mobile number", 400);

    const card = await redeemReward(session.cafeId, phone);
    if (!card) return apiError("No reward available for this number yet", 409);
    return apiSuccess(card);
  } catch (error) {
    logError("Failed to redeem reward:", error);
    return apiError("Failed to redeem reward", 500);
  }
}
