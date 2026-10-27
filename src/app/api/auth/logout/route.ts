import { endSession } from "@/app/lib/session";
import { apiError, apiSuccess } from "@/app/lib/api-response";
import { logError } from "@/app/lib/log";

export async function POST() {
  try {
    await endSession();
    return apiSuccess({ signedOut: true });
  } catch (error) {
    logError("Logout failed:", error);
    return apiError("Logout failed", 500);
  }
}
