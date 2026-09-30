import { randomUUID } from "node:crypto";
import { countUploadsSince, recordUpload } from "@/app/db/uploads";
import { getCafeSession } from "@/app/lib/session";
import { UPLOADS_BASE_URL } from "@/app/lib/image-hosts";
import { isR2Configured, putObject } from "@/app/lib/r2";
import {
  DAILY_UPLOAD_LIMIT,
  MAX_UPLOAD_BYTES,
  UPLOAD_EXTENSIONS,
  sniffImageType,
} from "@/app/lib/uploads";
import { apiError, apiSuccess } from "@/app/lib/api-response";

/** Room for the multipart boundary and headers around the file itself. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Stores one photo for the signed-in café: `multipart/form-data` with a
 * single `file` field. Responds with the public URL to save in an image field.
 *
 * The object key is built here from the session's cafeId and a random UUID —
 * nothing from the client (file name, type, café) reaches the key, so a café
 * can never write into another café's folder or overwrite an existing photo.
 */
export async function POST(request: Request) {
  try {
    const session = await getCafeSession();
    if (!session) return apiError("Authentication required", 401);
    const { cafeId } = session;

    const recent = await countUploadsSince(cafeId, new Date(Date.now() - DAY_MS));
    if (recent >= DAILY_UPLOAD_LIMIT) {
      return apiError(
        `You can upload up to ${DAILY_UPLOAD_LIMIT} photos a day. Please try again tomorrow.`,
        429,
      );
    }

    // Refuse obviously oversized bodies before reading them into memory.
    const declaredLength = Number(request.headers.get("content-length"));
    if (declaredLength > MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES) {
      return apiError(tooLargeMessage(), 413);
    }

    let file: FormDataEntryValue | null;
    try {
      file = (await request.formData()).get("file");
    } catch {
      return apiError("Send the photo as multipart form data", 400);
    }

    if (!(file instanceof File)) return apiError("Choose a photo to upload", 400);
    if (file.size === 0) return apiError("That file is empty", 400);
    if (file.size > MAX_UPLOAD_BYTES) return apiError(tooLargeMessage(), 413);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentType = sniffImageType(bytes);
    if (!contentType) {
      return apiError("Only JPEG, PNG and WebP photos can be uploaded", 415);
    }

    if (!isR2Configured() || !UPLOADS_BASE_URL) {
      return apiError("Photo uploads are not set up yet", 503);
    }

    const key = `cafes/${cafeId}/${randomUUID()}.${UPLOAD_EXTENSIONS[contentType]}`;

    try {
      await putObject(key, bytes, contentType);
    } catch (error) {
      console.error("Failed to store upload in R2:", error);
      return apiError("The photo could not be stored. Please try again.", 502);
    }

    const upload = await recordUpload(cafeId, {
      key,
      url: `${UPLOADS_BASE_URL}/${key}`,
      contentType,
      sizeBytes: bytes.byteLength,
    });

    return apiSuccess(upload, 201);
  } catch (error) {
    console.error("Upload failed:", error);
    return apiError("Upload failed", 500);
  }
}

function tooLargeMessage(): string {
  return `Photos must be under ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB`;
}
