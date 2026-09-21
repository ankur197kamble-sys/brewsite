import { eq } from "drizzle-orm";
import { db } from "@/app/db";
import { cafes } from "@/app/db/schema";
import type { DbCafe } from "@/app/lib/site-cafe";

export async function getCafe(cafeId: number): Promise<DbCafe | undefined> {
  const [cafe] = await db
    .select()
    .from(cafes)
    .where(eq(cafes.id, cafeId))
    .limit(1);

  return cafe;
}
