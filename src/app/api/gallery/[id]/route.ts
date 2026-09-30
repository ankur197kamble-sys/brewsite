import {
  deleteGalleryImage,
  moveGalleryImage,
  updateGalleryImage,
} from "@/app/db/gallery";
import { getCafeSession } from "@/app/lib/session";
import { validateGalleryImagePatch } from "@/app/lib/gallery";
import { parseId, parseMoveDirection } from "@/app/lib/validation";
import { apiError, apiSuccess, readJsonBody } from "@/app/lib/api-response";

type Context = { params: Promise<{ id: string }> };

/**
 * Accepts either a partial field update or a reorder
 * (`{ move: "up" | "down" }`), matching the menu routes.
 */
export async function PATCH(request: Request, context: Context) {
  try {
    const session = await getCafeSession();
    if (!session) return apiError("Authentication required", 401);

    const imageId = parseId((await context.params).id);
    if (imageId === null) return apiError("Invalid image id", 400);

    const cafeId = session.cafeId;
    const body = await readJsonBody(request);

    const move = parseMoveDirection(body);
    if (move) {
      const moved = await moveGalleryImage(cafeId, imageId, move);
      if (moved === "not_found") return apiError("Gallery image not found", 404);
      if (moved === "edge") return apiError("Image cannot move further", 400);
      return apiSuccess({ moved: true });
    }

    const parsed = validateGalleryImagePatch(body);
    if (!parsed.ok) return apiError(parsed.error, 400);

    const image = await updateGalleryImage(cafeId, imageId, parsed.value);
    if (!image) return apiError("Gallery image not found", 404);

    return apiSuccess(image);
  } catch (error) {
    console.error("Failed to update gallery image:", error);
    return apiError("Failed to update gallery image", 500);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const session = await getCafeSession();
    if (!session) return apiError("Authentication required", 401);

    const imageId = parseId((await context.params).id);
    if (imageId === null) return apiError("Invalid image id", 400);

    const deleted = await deleteGalleryImage(session.cafeId, imageId);
    if (!deleted) return apiError("Gallery image not found", 404);

    return apiSuccess({ deleted: true });
  } catch (error) {
    console.error("Failed to delete gallery image:", error);
    return apiError("Failed to delete gallery image", 500);
  }
}
