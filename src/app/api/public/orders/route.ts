import { NextResponse } from "next/server";
import { placeOrder, type RateLimit } from "@/app/db/orders";
import { validateOrderInput } from "@/app/lib/orders";
import { apiError, apiSuccess, readJsonBody } from "@/app/lib/api-response";
import { clientAddress, secretHash } from "@/app/lib/secret-hash";
import { logError } from "@/app/lib/log";

const LIMIT_MESSAGE: Record<RateLimit, string> = {
  device: "You've placed several orders in the last few minutes. Please wait a little, or ask the staff.",
  table: "This table has placed a lot of orders just now. Please ask the staff.",
  network: "Lots of orders are arriving just now. Please wait a few minutes, or order at the counter.",
};

/**
 * Places a customer order. Public by design (customers have no login), so
 * it is gated by the table's unguessable QR token, rate-limited per device,
 * per table and per network, and accepts only dish ids and quantities:
 * names and prices are read from the database. Retrying with the same
 * idempotency key returns the original order instead of placing another
 * (or, if the order was changed in between, says the first one went through).
 */
export async function POST(request: Request) {
  try {
    const parsed = validateOrderInput(await readJsonBody(request));
    if (!parsed.ok) return apiError(parsed.error, 400);

    const result = await placeOrder(
      parsed.value,
      secretHash(`ip:${clientAddress(request)}`),
      secretHash(`device:${parsed.value.deviceId}`),
    );

    switch (result.status) {
      case "ok":
        return apiSuccess({ token: result.token, number: result.number }, 201);
      case "unknown_table":
        return apiError("This table QR code is no longer valid. Please ask the staff.", 404);
      case "unavailable_items":
        return apiError("Some items in your order are no longer available. Please refresh the menu.", 409);
      case "too_large":
        return apiError("This order is too large to place from the app. Please order at the counter.", 400);
      case "rate_limited":
        return apiError(LIMIT_MESSAGE[result.limit], 429);
      case "already_placed":
        // A retry whose contents changed after the first try went through:
        // point the customer at the order the kitchen actually has.
        return NextResponse.json(
          {
            success: false,
            message: `Your earlier order #${result.number} already went through. Check it before ordering anything else.`,
            data: { token: result.token, number: result.number },
          },
          { status: 409 },
        );
    }
  } catch (error) {
    logError("Failed to place order:", error);
    return apiError("Could not place your order. Please try again.", 500);
  }
}
