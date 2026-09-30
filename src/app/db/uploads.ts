import { and, count, eq, gte } from "drizzle-orm";
import { db } from "@/app/db";
import { uploads } from "@/app/db/schema";

/**
 * Like every other data module, each function takes an explicit cafeId from
 * the session and filters on it.
 */

export type NewUpload = {
  key: string;
  url: string;
  contentType: string;
  sizeBytes: number;
};

export type UploadView = { id: number; url: string };

export async function recordUpload(
  cafeId: number,
  upload: NewUpload,
): Promise<UploadView> {
  const [row] = await db
    .insert(uploads)
    .values({ cafeId, ...upload })
    .returning({ id: uploads.id, url: uploads.url });

  return row;
}

export async function countUploadsSince(
  cafeId: number,
  since: Date,
): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(uploads)
    .where(and(eq(uploads.cafeId, cafeId), gte(uploads.createdAt, since)));

  return row?.total ?? 0;
}
