import { createGalleryImage, getGallery } from "@/app/db/gallery";
import { getCafeSession } from "@/app/lib/session";
import { validateGalleryImageInput } from "@/app/lib/gallery";
import { apiError, apiSuccess, readJsonBody } from "@/app/lib/api-response";

export async function GET() {
  try {
    const session = await getCafeSession();
    if (!session) return apiError("Authentication required", 401);

    const images = await getGallery(session.cafeId);
    return apiSuccess({ images });
  } catch (error) {
    console.error("Failed to load gallery:", error);
    return apiError("Failed to load gallery", 500);
  }
}

export async function POST(request: Request) {
  try {
    const session = await getCafeSession();
    if (!session) return apiError("Authentication required", 401);

    const parsed = validateGalleryImageInput(await readJsonBody(request));
    if (!parsed.ok) return apiError(parsed.error, 400);

    const image = await createGalleryImage(session.cafeId, parsed.value);
    return apiSuccess(image, 201);
  } catch (error) {
    console.error("Failed to create gallery image:", error);
    return apiError("Failed to create gallery image", 500);
  }
}
