import { getMenu } from "@/app/db/menu";
import { getCafeSession } from "@/app/lib/session";
import { apiError, apiSuccess } from "@/app/lib/api-response";

export async function GET() {
  try {
    const session = await getCafeSession();
    if (!session) return apiError("Authentication required", 401);

    const categories = await getMenu(session.cafeId);
    return apiSuccess({ categories });
  } catch (error) {
    console.error("Failed to load menu:", error);
    return apiError("Failed to load menu", 500);
  }
}
