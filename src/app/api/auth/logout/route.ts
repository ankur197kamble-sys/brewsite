import { endSession } from "@/app/lib/session";
import { apiError, apiSuccess } from "@/app/lib/api-response";

export async function POST() {
  try {
    await endSession();
    return apiSuccess({ signedOut: true });
  } catch (error) {
    console.error("Logout failed:", error);
    return apiError("Logout failed", 500);
  }
}
