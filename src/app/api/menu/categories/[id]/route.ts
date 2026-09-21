import { deleteCategory, moveCategory, updateCategory } from "@/app/db/menu";
import { getCafeSession } from "@/app/lib/session";
import {
  parseId,
  parseMoveDirection,
  validateCategoryInput,
} from "@/app/lib/menu";
import { apiError, apiSuccess, readJsonBody } from "@/app/lib/api-response";

type Context = { params: Promise<{ id: string }> };

/**
 * Accepts either a rename (`{ name }`) or a reorder (`{ move: "up" | "down" }`).
 */
export async function PATCH(request: Request, context: Context) {
  try {
    const session = await getCafeSession();
    if (!session) return apiError("Authentication required", 401);

    const categoryId = parseId((await context.params).id);
    if (categoryId === null) return apiError("Invalid category id", 400);

    const cafeId = session.cafeId;
    const body = await readJsonBody(request);

    const move = parseMoveDirection(body);
    if (move) {
      const moved = await moveCategory(cafeId, categoryId, move);
      if (!moved) return apiError("Category cannot move further", 400);
      return apiSuccess({ moved: true });
    }

    const parsed = validateCategoryInput(body);
    if (!parsed.ok) return apiError(parsed.error, 400);

    const category = await updateCategory(cafeId, categoryId, parsed.value);
    if (!category) return apiError("Category not found", 404);

    return apiSuccess(category);
  } catch (error) {
    console.error("Failed to update category:", error);
    return apiError("Failed to update category", 500);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const session = await getCafeSession();
    if (!session) return apiError("Authentication required", 401);

    const categoryId = parseId((await context.params).id);
    if (categoryId === null) return apiError("Invalid category id", 400);

    const result = await deleteCategory(session.cafeId, categoryId);

    if (result.status === "not_found") {
      return apiError("Category not found", 404);
    }

    if (result.status === "not_empty") {
      return apiError(
        `This category still has ${result.itemCount} item${
          result.itemCount === 1 ? "" : "s"
        }. Move or delete them first.`,
        409,
      );
    }

    return apiSuccess({ deleted: true });
  } catch (error) {
    console.error("Failed to delete category:", error);
    return apiError("Failed to delete category", 500);
  }
}
