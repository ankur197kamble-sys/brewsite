/**
 * Copies each café's legacy `cafes.gallery_images` URLs into the new
 * gallery_images table.
 *
 * Usage:
 *   node --env-file=.env.local scripts/backfill-gallery.mjs [--apply]
 *
 * Without --apply it only reports what it would do. It is safe to re-run:
 * a café that already has any gallery row is skipped entirely, so images are
 * never duplicated. It never deletes or edits the legacy column, which stays
 * as the public-site fallback.
 */
import { eq } from "drizzle-orm";
import { db } from "../src/app/db/index.ts";
import { cafes, galleryImages } from "../src/app/db/schema.ts";
import { normalizeStringList } from "../src/app/lib/json.ts";

const apply = process.argv.includes("--apply");

const allCafes = await db.select().from(cafes);
let created = 0;
let skipped = 0;

for (const cafe of allCafes) {
  const existing = await db
    .select({ id: galleryImages.id })
    .from(galleryImages)
    .where(eq(galleryImages.cafeId, cafe.id));

  if (existing.length > 0) {
    console.log(`- café #${cafe.id} "${cafe.name}": already has ${existing.length} image(s), skipping`);
    skipped += 1;
    continue;
  }

  const urls = normalizeStringList(cafe.galleryImages, []);

  if (urls.length === 0) {
    console.log(`- café #${cafe.id} "${cafe.name}": no legacy images, nothing to copy`);
    skipped += 1;
    continue;
  }

  console.log(`- café #${cafe.id} "${cafe.name}": ${apply ? "copying" : "would copy"} ${urls.length} image(s)`);

  if (apply) {
    await db.insert(galleryImages).values(
      urls.map((url, index) => ({
        cafeId: cafe.id,
        url,
        alt: null,
        sortOrder: index,
        isPublished: true,
      })),
    );
  }

  created += urls.length;
}

console.log("");
console.log(apply ? `Done. Inserted ${created} image(s). Skipped ${skipped} café(s).` : `Dry run. Would insert ${created} image(s). Would skip ${skipped} café(s).`);
console.log(apply ? "" : "Re-run with --apply to write these rows.");
process.exit(0);
