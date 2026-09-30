import { deleteItem, moveItem, updateItem } from "@/app/db/menu";
import { getCafeSession } from "@/app/lib/session";
import {
  parseId,
  parseMoveDirection,
  validateMenuItemPatch,
} from "@/app/lib/menu";
import { apiError, apiSuccess, readJsonBody } from "@/app/lib/api-response";

type Context = { params: Promise<{ id: string }> };

/**
 * Accepts either a partial field update or a reorder (`{ move: "up" | "down" }`).
 */
export async function PATCH(request: Request, context: Context) {
  try {
    const session = await getCafeSession();
    if (!session) return apiError("Authentication required", 401);

    const itemId = parseId((await context.params).id);
    if (itemId === null) return apiError("Invalid item id", 400);

    const cafeId = session.cafeId;
    const body = await readJsonBody(request);

    const move = parseMoveDirection(body);
    if (move) {
      const moved = await moveItem(cafeId, itemId, move);
      if (moved === "not_found") return apiError("Menu item not found", 404);
      if (moved === "edge") return apiError("Item cannot move further", 400);
      return apiSuccess({ moved: true });
    }

    const parsed = validateMenuItemPatch(body);
    if (!parsed.ok) return apiError(parsed.error, 400);

    const result = await updateItem(cafeId, itemId, parsed.value);

    if (result.status === "invalid_category") {
      return apiError("Category not found", 404);
    }

    if (result.status === "not_found") {
      return apiError("Menu item not found", 404);
    }

    return apiSuccess(result.item);
  } catch (error) {
    console.error("Failed to update menu item:", error);
    return apiError("Failed to update menu item", 500);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const session = await getCafeSession();
    if (!session) return apiError("Authentication required", 401);

    const itemId = parseId((await context.params).id);
    if (itemId === null) return apiError("Invalid item id", 400);

    const deleted = await deleteItem(session.cafeId, itemId);
    if (!deleted) return apiError("Menu item not found", 404);

    return apiSuccess({ deleted: true });
  } catch (error) {
    console.error("Failed to delete menu item:", error);
    return apiError("Failed to delete menu item", 500);
  }
}
