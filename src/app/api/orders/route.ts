import { listStaffOrders } from "@/app/db/orders";
import { getCafeSession } from "@/app/lib/session";
import { apiError, apiSuccess } from "@/app/lib/api-response";

/** Staff orders screen: active orders plus the last 12 hours, for this café only. */
export async function GET() {
  try {
    const session = await getCafeSession();
    if (!session) return apiError("Authentication required", 401);
    return apiSuccess({ orders: await listStaffOrders(session.cafeId) });
  } catch (error) {
    console.error("Failed to load orders:", error);
    return apiError("Failed to load orders", 500);
  }
}
