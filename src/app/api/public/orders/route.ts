import { createHash } from "node:crypto";
import { placeOrder } from "@/app/db/orders";
import { validateOrderInput } from "@/app/lib/orders";
import { apiError, apiSuccess, readJsonBody } from "@/app/lib/api-response";

/**
 * Places a customer order. Public by design (customers have no login), so
 * it is gated by the table's unguessable QR token, rate-limited per table and
 * per client, and accepts only dish ids and quantities: names and prices are
 * read from the database.
 */
export async function POST(request: Request) {
  try {
    const parsed = validateOrderInput(await readJsonBody(request));
    if (!parsed.ok) return apiError(parsed.error, 400);

    const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
    // Hashed with a server secret: only ever compared, never turned back into an IP.
    const clientHash = createHash("sha256")
      .update(`${ip}|${process.env.DATABASE_URL ?? ""}`)
      .digest("hex");

    const result = await placeOrder(parsed.value, clientHash);
    switch (result.status) {
      case "ok":
        return apiSuccess({ token: result.token, number: result.number }, 201);
      case "unknown_table":
        return apiError("This table QR code is no longer valid. Please ask the staff.", 404);
      case "unavailable_items":
        return apiError("Some items in your order are no longer available. Please refresh the menu.", 409);
      case "rate_limited":
        return apiError("Too many orders from this table just now. Please ask the staff.", 429);
    }
  } catch (error) {
    console.error("Failed to place order:", error);
    return apiError("Could not place your order. Please try again.", 500);
  }
}
