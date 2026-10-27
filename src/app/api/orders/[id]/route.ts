import { updateOrderStatus } from "@/app/db/orders";
import { getCafeSession } from "@/app/lib/session";
import { isOrderStatus, STATUS_LABEL } from "@/app/lib/orders";
import { asRecord } from "@/app/lib/json";
import { parseId } from "@/app/lib/validation";
import { apiError, apiSuccess, readJsonBody } from "@/app/lib/api-response";
import { logError } from "@/app/lib/log";

type Context = { params: Promise<{ id: string }> };

/** `{ status }` moves an order forward or cancels it. */
export async function PATCH(request: Request, context: Context) {
  try {
    const session = await getCafeSession();
    if (!session) return apiError("Authentication required", 401);

    const orderId = parseId((await context.params).id);
    if (orderId === null) return apiError("Invalid order id", 400);

    const status = asRecord(await readJsonBody(request))?.status;
    if (!isOrderStatus(status)) return apiError("Invalid status", 400);

    const result = await updateOrderStatus(session.cafeId, orderId, status);
    if (result.status === "not_found") return apiError("Order not found", 404);
    if (result.status === "invalid_transition") {
      return apiError(
        `This order is already ${STATUS_LABEL[result.from].toLowerCase()}. Refresh to see the latest.`,
        409,
      );
    }
    return apiSuccess({ updated: true });
  } catch (error) {
    logError("Failed to update order:", error);
    return apiError("Failed to update order", 500);
  }
}
