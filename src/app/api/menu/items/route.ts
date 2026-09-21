import { createItem } from "@/app/db/menu";
import { getCafeSession } from "@/app/lib/session";
import { validateMenuItemInput } from "@/app/lib/menu";
import { apiError, apiSuccess, readJsonBody } from "@/app/lib/api-response";

export async function POST(request: Request) {
  try {
    const session = await getCafeSession();
    if (!session) return apiError("Authentication required", 401);

    const parsed = validateMenuItemInput(await readJsonBody(request));
    if (!parsed.ok) return apiError(parsed.error, 400);

    const item = await createItem(session.cafeId, parsed.value);
    if (!item) return apiError("Category not found", 404);

    return apiSuccess(item, 201);
  } catch (error) {
    console.error("Failed to create menu item:", error);
    return apiError("Failed to create menu item", 500);
  }
}
