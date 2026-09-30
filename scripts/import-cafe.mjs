/**
 * Imports a café's details and menu from a JSON file — the repeatable part
 * of onboarding a new café from its printed menu card.
 *
 * Usage:
 *   node --env-file=.env.local scripts/import-cafe.mjs <cafeId> <file.json> [--apply]
 *   npm run import-cafe -- <cafeId> <file.json> [--apply]
 *
 * Without --apply it only prints what would change. It is safe to re-run:
 * categories and items are matched by name (case-insensitive) and updated in
 * place, never duplicated. It never deletes anything: with
 * "hideMissing": true, published items that are not in the file are hidden
 * (unpublished) so the owner can review or delete them in the dashboard.
 *
 * File format:
 *   {
 *     "cafe": { "name": "...", "highlights": "...", "tagline": "...",
 *               "story": "...", "storySecondary": "...", "foundedYear": null,
 *               "phone": "...", "whatsapp": null, "instagram": "...",
 *               "mapsUrl": "...", "address": ["line 1", "line 2"], "hours": [] },
 *     "menu": [
 *       { "category": "Pizza", "items": [
 *           { "name": "Margherita Pizza", "price": 279 },
 *           { "name": "…", "price": 229, "published": false, "note": "price unclear" }
 *       ] }
 *     ],
 *     "hideMissing": true
 *   }
 * Every "cafe" key is optional; a key that is present overwrites the stored
 * value, and null (or an empty list) clears it.
 */
import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { db } from "../src/app/db/index.ts";
import { cafes, menuCategories, menuItems } from "../src/app/db/schema.ts";

const [cafeIdArg, fileArg] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const apply = process.argv.includes("--apply");

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (!cafeIdArg || !fileArg) {
  fail("Usage: node --env-file=.env.local scripts/import-cafe.mjs <cafeId> <file.json> [--apply]");
}

const cafeId = Number(cafeIdArg);
if (!Number.isInteger(cafeId) || cafeId < 1) fail("cafeId must be a positive integer.");

let input;
try {
  input = JSON.parse(readFileSync(fileArg, "utf8"));
} catch (error) {
  fail(`Could not read ${fileArg}: ${error.message}`);
}

/* ------------------------------------------------------------ validation */

const MAX_PRICE = 99_999_999.99;
const TEXT_FIELDS = {
  name: 120,
  highlights: 80,
  tagline: 160,
  story: 300,
  storySecondary: 600,
  phone: 40,
  whatsapp: 20,
  instagram: 300,
  mapsUrl: 1000,
};
const LIST_FIELDS = { address: 120, hours: 80 };
const errors = [];

function text(value, max, label, { required = false } = {}) {
  if (value === null || value === undefined) {
    if (required) errors.push(`${label} is required`);
    return null;
  }
  if (typeof value !== "string") {
    errors.push(`${label} must be text`);
    return null;
  }
  const trimmed = value.trim();
  if (required && !trimmed) errors.push(`${label} is required`);
  if (trimmed.length > max) errors.push(`${label} must be at most ${max} characters`);
  return trimmed || null;
}

function price(value, label) {
  const raw = typeof value === "number" ? String(value) : value;
  if (typeof raw !== "string" || !/^\d+(\.\d{1,2})?$/.test(raw.trim())) {
    errors.push(`${label}: price must be a number with at most 2 decimals`);
    return null;
  }
  const amount = Number(raw);
  if (amount > MAX_PRICE) errors.push(`${label}: price is too large`);
  return amount.toFixed(2);
}

const cafeInput = input.cafe ?? {};
const cafePatch = {};
for (const [key, max] of Object.entries(TEXT_FIELDS)) {
  if (key in cafeInput) {
    cafePatch[key] = text(cafeInput[key], max, `cafe.${key}`, { required: key === "name" });
  }
}
if (cafePatch.whatsapp && !/^\d{8,15}$/.test(cafePatch.whatsapp)) {
  errors.push("cafe.whatsapp must be digits only, with country code (e.g. 919876543210)");
}
for (const key of ["instagram", "mapsUrl"]) {
  if (cafePatch[key] && !/^https:\/\//.test(cafePatch[key])) errors.push(`cafe.${key} must be an https URL`);
}
if ("foundedYear" in cafeInput) {
  const year = cafeInput.foundedYear;
  if (year === null) cafePatch.foundedYear = null;
  else if (Number.isInteger(year) && year >= 1800 && year <= new Date().getFullYear() + 1) cafePatch.foundedYear = year;
  else errors.push("cafe.foundedYear must be a year or null");
}
for (const [key, max] of Object.entries(LIST_FIELDS)) {
  if (!(key in cafeInput)) continue;
  const list = cafeInput[key];
  if (list !== null && !Array.isArray(list)) {
    errors.push(`cafe.${key} must be a list of lines or null`);
    continue;
  }
  const lines = (list ?? []).map((line, i) => text(line, max, `cafe.${key}[${i}]`)).filter(Boolean);
  cafePatch[key] = lines.length > 0 ? JSON.stringify(lines) : null;
}

const menu = [];
const seenCategories = new Set();
for (const [ci, section] of (input.menu ?? []).entries()) {
  const category = text(section?.category, 80, `menu[${ci}].category`, { required: true });
  if (!category) continue;
  const categoryKey = category.toLowerCase();
  if (seenCategories.has(categoryKey)) errors.push(`Category "${category}" appears twice`);
  seenCategories.add(categoryKey);

  const items = [];
  const seenItems = new Set();
  for (const [ii, item] of (section.items ?? []).entries()) {
    const label = `${category} › ${item?.name ?? `#${ii + 1}`}`;
    const name = text(item?.name, 120, `${label} name`, { required: true });
    if (!name) continue;
    if (seenItems.has(name.toLowerCase())) errors.push(`${label} appears twice`);
    seenItems.add(name.toLowerCase());
    items.push({
      name,
      price: price(item.price, label),
      description: text(item.description, 500, `${label} description`),
      isPublished: item.published !== false,
      note: typeof item.note === "string" ? item.note : null,
    });
  }
  menu.push({ category, items });
}

if (errors.length > 0) {
  console.error("✗ The file has problems — nothing was changed:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

/* ------------------------------------------------------------------ plan */

const [cafe] = await db.select().from(cafes).where(eq(cafes.id, cafeId)).limit(1);
if (!cafe) fail(`No café with id ${cafeId} exists.`);

const existingCategories = await db
  .select()
  .from(menuCategories)
  .where(eq(menuCategories.cafeId, cafeId));
const existingItems = await db.select().from(menuItems).where(eq(menuItems.cafeId, cafeId));

const show = (value) => (value === null || value === undefined ? "—" : JSON.stringify(value));

console.log(`${apply ? "Importing into" : "Dry run for"} café #${cafeId} "${cafe.name}"\n`);

const cafeChanges = Object.entries(cafePatch).filter(([key, value]) => cafe[key] !== value);
console.log(`Café details: ${cafeChanges.length} change(s)`);
for (const [key, value] of cafeChanges) console.log(`  ${key}: ${show(cafe[key])} → ${show(value)}`);

// Categories not in the file keep their order and come first; the file's
// categories follow in the order given.
const fileKeys = new Set(menu.map((section) => section.category.toLowerCase()));
const keptCategories = existingCategories
  .filter((category) => !fileKeys.has(category.name.toLowerCase()))
  .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);

const categoryPlan = menu.map((section, index) => ({
  ...section,
  existing: existingCategories.find((c) => c.name.toLowerCase() === section.category.toLowerCase()),
  sortOrder: keptCategories.length + index,
}));

const plan = { newCategories: 0, reorderedCategories: 0, created: 0, updated: 0, unchanged: 0, hidden: [] };
const itemWrites = [];
const matchedItemIds = new Set();

for (const section of categoryPlan) {
  if (!section.existing) plan.newCategories += 1;
  else if (section.existing.sortOrder !== section.sortOrder) plan.reorderedCategories += 1;

  section.items.forEach((item, index) => {
    const existing = section.existing
      ? existingItems.find(
          (row) => row.categoryId === section.existing.id && row.name.toLowerCase() === item.name.toLowerCase(),
        )
      : undefined;

    if (existing) {
      matchedItemIds.add(existing.id);
      const changed =
        existing.name !== item.name ||
        Number(existing.price).toFixed(2) !== item.price ||
        (existing.description ?? null) !== item.description ||
        existing.isPublished !== item.isPublished ||
        existing.sortOrder !== index;
      if (changed) {
        plan.updated += 1;
        itemWrites.push({ kind: "update", id: existing.id, item, sortOrder: index });
      } else {
        plan.unchanged += 1;
      }
    } else {
      plan.created += 1;
      itemWrites.push({ kind: "create", section, item, sortOrder: index });
    }
  });
}

const toHide = input.hideMissing
  ? existingItems.filter((row) => row.isPublished && !matchedItemIds.has(row.id))
  : [];
plan.hidden = toHide.map((row) => row.name);

const hiddenInFile = menu.flatMap((section) =>
  section.items.filter((item) => !item.isPublished).map((item) => ({ ...item, category: section.category })),
);

console.log(`\nMenu: ${categoryPlan.length} categories in the file (${plan.newCategories} new, ${plan.reorderedCategories} reordered)`);
console.log(`  items: ${plan.created} new, ${plan.updated} updated, ${plan.unchanged} unchanged`);
if (plan.hidden.length > 0) console.log(`  hiding ${plan.hidden.length} item(s) not in the file: ${plan.hidden.join(", ")}`);
if (hiddenInFile.length > 0) {
  console.log(`\nImported as hidden, for the owner to confirm (${hiddenInFile.length}):`);
  for (const item of hiddenInFile) {
    console.log(`  - ${item.category} › ${item.name} (₹${Number(item.price)})${item.note ? ` — ${item.note}` : ""}`);
  }
}

if (!apply) {
  console.log("\nDry run only. Re-run with --apply to write these changes.");
  process.exit(0);
}

/* ----------------------------------------------------------------- apply */

const now = new Date();

if (cafeChanges.length > 0) {
  await db.update(cafes).set(Object.fromEntries(cafeChanges)).where(eq(cafes.id, cafeId));
}

// Kept categories first, in their existing relative order.
for (const [index, category] of keptCategories.entries()) {
  if (category.sortOrder !== index) {
    await db
      .update(menuCategories)
      .set({ sortOrder: index, updatedAt: now })
      .where(and(eq(menuCategories.cafeId, cafeId), eq(menuCategories.id, category.id)));
  }
}

for (const section of categoryPlan) {
  if (section.existing) {
    if (section.existing.sortOrder !== section.sortOrder) {
      await db
        .update(menuCategories)
        .set({ sortOrder: section.sortOrder, updatedAt: now })
        .where(and(eq(menuCategories.cafeId, cafeId), eq(menuCategories.id, section.existing.id)));
    }
  } else {
    const [created] = await db
      .insert(menuCategories)
      .values({ cafeId, name: section.category, sortOrder: section.sortOrder })
      .returning();
    section.existing = created;
  }
}

for (const write of itemWrites) {
  const values = {
    name: write.item.name,
    price: write.item.price,
    description: write.item.description,
    isPublished: write.item.isPublished,
    sortOrder: write.sortOrder,
  };
  if (write.kind === "update") {
    await db
      .update(menuItems)
      .set({ ...values, updatedAt: now })
      .where(and(eq(menuItems.cafeId, cafeId), eq(menuItems.id, write.id)));
  } else {
    await db.insert(menuItems).values({ ...values, cafeId, categoryId: write.section.existing.id });
  }
}

for (const row of toHide) {
  await db
    .update(menuItems)
    .set({ isPublished: false, updatedAt: now })
    .where(and(eq(menuItems.cafeId, cafeId), eq(menuItems.id, row.id)));
}

console.log("\n✓ Import complete.");
process.exit(0);
