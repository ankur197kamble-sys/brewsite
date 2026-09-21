import { createCategory } from "@/app/db/menu";
import { getCafeSession } from "@/app/lib/session";
import { validateCategoryInput } from "@/app/lib/menu";
import { apiError, apiSuccess, readJsonBody } from "@/app/lib/api-response";

export async function POST(request: Request) {
  try {
    const session = await getCafeSession();
    if (!session) return apiError("Authentication required", 401);

    const parsed = validateCategoryInput(await readJsonBody(request));
    if (!parsed.ok) return apiError(parsed.error, 400);

    const category = await createCategory(session.cafeId, parsed.value);
    return apiSuccess(category, 201);
  } catch (error) {
    console.error("Failed to create category:", error);
    return apiError("Failed to create category", 500);
  }
}
