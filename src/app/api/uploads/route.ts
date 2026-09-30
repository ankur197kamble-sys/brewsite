import { randomUUID } from "node:crypto";
import {
  countUploadsSince,
  deleteUpload,
  recordUpload,
} from "@/app/db/uploads";
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
const MAX_BODY_BYTES = MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES;
const DAY_MS = 24 * 60 * 60 * 1000;

const LIMIT_MESSAGE = `You can upload up to ${DAILY_UPLOAD_LIMIT} photos a day. Please try again tomorrow.`;
const TOO_LARGE_MESSAGE = `Photos must be under ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB`;

type ParsedForm =
  | { ok: true; form: FormData }
  | { ok: false; status: 400 | 413 };

/**
 * Parses the multipart body while counting the bytes actually received.
 * Neither Next.js route handlers nor `formData()` cap the body size, and a
 * chunked request carries no Content-Length to check up front, so the cap is
 * enforced on the stream itself: reading stops as soon as it is exceeded.
 */
async function readForm(request: Request): Promise<ParsedForm> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!request.body || !contentType.toLowerCase().startsWith("multipart/form-data")) {
    return { ok: false, status: 400 };
  }

  let received = 0;
  let tooLarge = false;
  const limited = request.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.byteLength;
        if (received > MAX_BODY_BYTES) {
          tooLarge = true;
          controller.error(new Error("Upload body too large"));
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );

  try {
    const form = await new Response(limited, {
      headers: { "Content-Type": contentType },
    }).formData();
    return { ok: true, form };
  } catch {
    return { ok: false, status: tooLarge ? 413 : 400 };
  }
}

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
    const since = () => new Date(Date.now() - DAY_MS);

    // Cheap early exit before reading any body. Not authoritative: the
    // reservation below is what actually enforces the limit.
    if ((await countUploadsSince(cafeId, since())) >= DAILY_UPLOAD_LIMIT) {
      return apiError(LIMIT_MESSAGE, 429);
    }

    // Refuse obviously oversized bodies before reading them at all.
    const declaredLength = Number(request.headers.get("content-length"));
    if (declaredLength > MAX_BODY_BYTES) {
      return apiError(TOO_LARGE_MESSAGE, 413);
    }

    const parsed = await readForm(request);
    if (!parsed.ok) {
      return parsed.status === 413
        ? apiError(TOO_LARGE_MESSAGE, 413)
        : apiError("Send the photo as multipart form data", 400);
    }

    const file = parsed.form.get("file");
    if (!(file instanceof File)) return apiError("Choose a photo to upload", 400);
    if (file.size === 0) return apiError("That file is empty", 400);
    if (file.size > MAX_UPLOAD_BYTES) return apiError(TOO_LARGE_MESSAGE, 413);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentType = sniffImageType(bytes);
    if (!contentType) {
      return apiError("Only JPEG, PNG and WebP photos can be uploaded", 415);
    }

    if (!isR2Configured() || !UPLOADS_BASE_URL) {
      return apiError("Photo uploads are not set up yet", 503);
    }

    const key = `cafes/${cafeId}/${randomUUID()}.${UPLOAD_EXTENSIONS[contentType]}`;

    // Reserve the slot first, then count. Each insert commits before its own
    // count runs, so of any burst of parallel uploads the last one admitted
    // always sees every other admitted row: the limit can be hit exactly but
    // never exceeded (a burst at the boundary may refuse a few extra).
    const upload = await recordUpload(cafeId, {
      key,
      url: `${UPLOADS_BASE_URL}/${key}`,
      contentType,
      sizeBytes: bytes.byteLength,
    });

    if ((await countUploadsSince(cafeId, since())) > DAILY_UPLOAD_LIMIT) {
      await deleteUpload(cafeId, upload.id);
      return apiError(LIMIT_MESSAGE, 429);
    }

    try {
      await putObject(key, bytes, contentType);
    } catch (error) {
      console.error("Failed to store upload in R2:", error);
      await deleteUpload(cafeId, upload.id);
      return apiError("The photo could not be stored. Please try again.", 502);
    }

    return apiSuccess(upload, 201);
  } catch (error) {
    console.error("Upload failed:", error);
    return apiError("Upload failed", 500);
  }
}
