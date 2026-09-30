import { and, asc, eq } from "drizzle-orm";
import { db } from "@/app/db";
import {
  menuCategories,
  menuItems,
  type MenuCategoryRow,
  type MenuItemRow,
} from "@/app/db/schema";
import type {
  CategoryInput,
  MenuCategoryView,
  MenuItemInput,
  MoveDirection,
} from "@/app/lib/menu";
import type { MoveResult } from "@/app/lib/validation";

/**
 * Every function here takes an explicit cafeId and filters on it. Tenant
 * isolation lives in this layer so no route or page can accidentally read or
 * write another café's menu.
 */

export async function getMenu(cafeId: number): Promise<MenuCategoryView[]> {
  const [categories, items] = await Promise.all([
    db
      .select()
      .from(menuCategories)
      .where(eq(menuCategories.cafeId, cafeId))
      .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.id)),
    db
      .select()
      .from(menuItems)
      .where(eq(menuItems.cafeId, cafeId))
      .orderBy(asc(menuItems.sortOrder), asc(menuItems.id)),
  ]);

  const byCategory = new Map<number, MenuCategoryView>();

  for (const category of categories) {
    byCategory.set(category.id, {
      id: category.id,
      name: category.name,
      sortOrder: category.sortOrder,
      items: [],
    });
  }

  for (const item of items) {
    byCategory.get(item.categoryId)?.items.push({
      id: item.id,
      categoryId: item.categoryId,
      name: item.name,
      description: item.description,
      price: item.price,
      imageUrl: item.imageUrl,
      sortOrder: item.sortOrder,
      isPublished: item.isPublished,
    });
  }

  return [...byCategory.values()];
}

async function nextCategorySortOrder(cafeId: number): Promise<number> {
  const rows = await db
    .select({ sortOrder: menuCategories.sortOrder })
    .from(menuCategories)
    .where(eq(menuCategories.cafeId, cafeId));

  return rows.reduce((max, row) => Math.max(max, row.sortOrder + 1), 0);
}

async function nextItemSortOrder(
  cafeId: number,
  categoryId: number,
): Promise<number> {
  const rows = await db
    .select({ sortOrder: menuItems.sortOrder })
    .from(menuItems)
    .where(
      and(eq(menuItems.cafeId, cafeId), eq(menuItems.categoryId, categoryId)),
    );

  return rows.reduce((max, row) => Math.max(max, row.sortOrder + 1), 0);
}

async function findCategory(
  cafeId: number,
  categoryId: number,
): Promise<MenuCategoryRow | undefined> {
  const [category] = await db
    .select()
    .from(menuCategories)
    .where(
      and(eq(menuCategories.cafeId, cafeId), eq(menuCategories.id, categoryId)),
    )
    .limit(1);

  return category;
}

export async function createCategory(
  cafeId: number,
  input: CategoryInput,
): Promise<MenuCategoryRow> {
  const [category] = await db
    .insert(menuCategories)
    .values({
      cafeId,
      name: input.name,
      sortOrder: await nextCategorySortOrder(cafeId),
    })
    .returning();

  return category;
}

export async function updateCategory(
  cafeId: number,
  categoryId: number,
  input: CategoryInput,
): Promise<MenuCategoryRow | undefined> {
  const [category] = await db
    .update(menuCategories)
    .set({ name: input.name, updatedAt: new Date() })
    .where(
      and(eq(menuCategories.cafeId, cafeId), eq(menuCategories.id, categoryId)),
    )
    .returning();

  return category;
}

export type DeleteCategoryResult =
  | { status: "deleted" }
  | { status: "not_found" }
  | { status: "not_empty"; itemCount: number };

/**
 * A category is only removable once it holds no items, so deleting one can
 * never orphan or silently destroy menu items. The database enforces the same
 * rule with ON DELETE RESTRICT.
 */
export async function deleteCategory(
  cafeId: number,
  categoryId: number,
): Promise<DeleteCategoryResult> {
  const category = await findCategory(cafeId, categoryId);
  if (!category) return { status: "not_found" };

  const items = await db
    .select({ id: menuItems.id })
    .from(menuItems)
    .where(
      and(eq(menuItems.cafeId, cafeId), eq(menuItems.categoryId, categoryId)),
    );

  if (items.length > 0) {
    return { status: "not_empty", itemCount: items.length };
  }

  await db
    .delete(menuCategories)
    .where(
      and(eq(menuCategories.cafeId, cafeId), eq(menuCategories.id, categoryId)),
    );

  return { status: "deleted" };
}

export async function moveCategory(
  cafeId: number,
  categoryId: number,
  direction: MoveDirection,
): Promise<MoveResult> {
  const ordered = await db
    .select({ id: menuCategories.id, sortOrder: menuCategories.sortOrder })
    .from(menuCategories)
    .where(eq(menuCategories.cafeId, cafeId))
    .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.id));

  const index = ordered.findIndex((row) => row.id === categoryId);
  if (index === -1) return "not_found";

  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= ordered.length) return "edge";

  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];

  await Promise.all(
    ordered
      .map((row, position) => ({ row, position }))
      .filter(({ row, position }) => row.sortOrder !== position)
      .map(({ row, position }) =>
        db
          .update(menuCategories)
          .set({ sortOrder: position, updatedAt: new Date() })
          .where(
            and(
              eq(menuCategories.cafeId, cafeId),
              eq(menuCategories.id, row.id),
            ),
          ),
      ),
  );

  return "moved";
}

export async function createItem(
  cafeId: number,
  input: MenuItemInput,
): Promise<MenuItemRow | undefined> {
  const category = await findCategory(cafeId, input.categoryId);
  if (!category) return undefined;

  const [item] = await db
    .insert(menuItems)
    .values({
      cafeId,
      categoryId: input.categoryId,
      name: input.name,
      description: input.description,
      price: input.price,
      imageUrl: input.imageUrl,
      isPublished: input.isPublished,
      sortOrder: await nextItemSortOrder(cafeId, input.categoryId),
    })
    .returning();

  return item;
}

export type UpdateItemResult =
  | { status: "updated"; item: MenuItemRow }
  | { status: "not_found" }
  | { status: "invalid_category" };

export async function updateItem(
  cafeId: number,
  itemId: number,
  patch: Partial<MenuItemInput>,
): Promise<UpdateItemResult> {
  if (patch.categoryId !== undefined) {
    const category = await findCategory(cafeId, patch.categoryId);
    if (!category) return { status: "invalid_category" };
  }

  const [item] = await db
    .update(menuItems)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(menuItems.cafeId, cafeId), eq(menuItems.id, itemId)))
    .returning();

  if (!item) return { status: "not_found" };

  return { status: "updated", item };
}

export async function deleteItem(
  cafeId: number,
  itemId: number,
): Promise<boolean> {
  const [item] = await db
    .delete(menuItems)
    .where(and(eq(menuItems.cafeId, cafeId), eq(menuItems.id, itemId)))
    .returning({ id: menuItems.id });

  return Boolean(item);
}

export async function moveItem(
  cafeId: number,
  itemId: number,
  direction: MoveDirection,
): Promise<MoveResult> {
  const [item] = await db
    .select({ categoryId: menuItems.categoryId })
    .from(menuItems)
    .where(and(eq(menuItems.cafeId, cafeId), eq(menuItems.id, itemId)))
    .limit(1);

  if (!item) return "not_found";

  const ordered = await db
    .select({ id: menuItems.id, sortOrder: menuItems.sortOrder })
    .from(menuItems)
    .where(
      and(
        eq(menuItems.cafeId, cafeId),
        eq(menuItems.categoryId, item.categoryId),
      ),
    )
    .orderBy(asc(menuItems.sortOrder), asc(menuItems.id));

  const index = ordered.findIndex((row) => row.id === itemId);
  if (index === -1) return "not_found";

  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= ordered.length) return "edge";

  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];

  await Promise.all(
    ordered
      .map((row, position) => ({ row, position }))
      .filter(({ row, position }) => row.sortOrder !== position)
      .map(({ row, position }) =>
        db
          .update(menuItems)
          .set({ sortOrder: position, updatedAt: new Date() })
          .where(and(eq(menuItems.cafeId, cafeId), eq(menuItems.id, row.id))),
      ),
  );

  return "moved";
}
