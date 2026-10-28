import { getPublicOrder } from "@/app/db/orders";
import { apiError, apiSuccess } from "@/app/lib/api-response";
import { logError } from "@/app/lib/log";

type Context = { params: Promise<{ token: string }> };

/** A customer's own order, by its private link token. No phone number is shown. */
export async function GET(_request: Request, context: Context) {
  try {
    const { token } = await context.params;
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return apiError("Order not found", 404);

    const order = await getPublicOrder(token);
    if (!order) return apiError("Order not found", 404);
    return apiSuccess(order);
  } catch (error) {
    logError("Failed to load order:", error);
    return apiError("Could not load this order", 500);
  }
}
