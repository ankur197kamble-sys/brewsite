import type { MenuItem as StaticMenuItem } from "@/app/data/cafe";
import { asRecord } from "@/app/lib/json";
import { parseImageUrl } from "@/app/lib/image-hosts";
import { invalid, parseId, type Validated } from "@/app/lib/validation";

// Re-exported so existing importers of these generic helpers keep working.
export { parseId, parseMoveDirection } from "@/app/lib/validation";
export type { MoveDirection, Validated } from "@/app/lib/validation";

/** Platform default. Becomes a per-café setting when currencies are needed. */
export const CURRENCY_SYMBOL = "₹";

const MAX_NAME_LENGTH = 120;
const MAX_CATEGORY_NAME_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 500;
/** Ceiling implied by the numeric(10, 2) price column. */
const MAX_PRICE = 99_999_999.99;

export type MenuItemView = {
  id: number;
  categoryId: number;
  name: string;
  description: string | null;
  price: string;
  imageUrl: string | null;
  sortOrder: number;
  isPublished: boolean;
};

export type MenuCategoryView = {
  id: number;
  name: string;
  sortOrder: number;
  items: MenuItemView[];
};

export type MenuItemInput = {
  categoryId: number;
  name: string;
  description: string | null;
  price: string;
  imageUrl: string | null;
  isPublished: boolean;
};

export type CategoryInput = {
  name: string;
};

/**
 * Accepts what a price field realistically receives — "220", "220.5",
 * "₹1,220.50" — and returns a canonical "220.50" string for the numeric
 * column, or null when the value isn't a usable price.
 */
export function parsePrice(value: unknown): string | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0 || value > MAX_PRICE) return null;
    return value.toFixed(2);
  }

  if (typeof value !== "string") return null;

  const cleaned = value.replace(/[\s,]/g, "").replace(CURRENCY_SYMBOL, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;

  const amount = Number(cleaned);
  if (!Number.isFinite(amount) || amount > MAX_PRICE) return null;

  return amount.toFixed(2);
}

/** "220.00" -> "₹220", "220.50" -> "₹220.50" */
export function formatPrice(price: string): string {
  const amount = Number(price);
  if (!Number.isFinite(amount)) return `${CURRENCY_SYMBOL}${price}`;

  const hasPaise = Math.round(amount * 100) % 100 !== 0;
  return `${CURRENCY_SYMBOL}${amount.toFixed(hasPaise ? 2 : 0)}`;
}

function parseName(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) return null;
  return trimmed;
}

function parseOptionalText(
  value: unknown,
  maxLength: number,
): { ok: true; value: string | null } | { ok: false } {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false };

  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > maxLength) return { ok: false };

  return { ok: true, value: trimmed };
}


export function validateCategoryInput(body: unknown): Validated<CategoryInput> {
  const record = asRecord(body);
  if (!record) return invalid("Invalid request body");

  const name = parseName(record.name, MAX_CATEGORY_NAME_LENGTH);
  if (!name) {
    return invalid(
      `Category name is required and must be under ${MAX_CATEGORY_NAME_LENGTH} characters`,
    );
  }

  return { ok: true, value: { name } };
}

export function validateMenuItemInput(body: unknown): Validated<MenuItemInput> {
  const record = asRecord(body);
  if (!record) return invalid("Invalid request body");

  const categoryId = parseId(record.categoryId);
  if (categoryId === null) return invalid("A valid category is required");

  const name = parseName(record.name, MAX_NAME_LENGTH);
  if (!name) {
    return invalid(
      `Item name is required and must be under ${MAX_NAME_LENGTH} characters`,
    );
  }

  const price = parsePrice(record.price);
  if (price === null) return invalid("Enter a valid price, for example 220.00");

  const description = parseOptionalText(
    record.description,
    MAX_DESCRIPTION_LENGTH,
  );
  if (!description.ok) {
    return invalid(
      `Description must be under ${MAX_DESCRIPTION_LENGTH} characters`,
    );
  }

  const imageUrl = parseImageUrl(record.imageUrl, "Image URL");
  if (!imageUrl.ok) return invalid(imageUrl.error);

  const isPublished =
    record.isPublished === undefined ? true : record.isPublished === true;

  return {
    ok: true,
    value: {
      categoryId,
      name,
      description: description.value,
      price,
      imageUrl: imageUrl.value,
      isPublished,
    },
  };
}

/** Partial update: only the keys actually present are validated and returned. */
export function validateMenuItemPatch(
  body: unknown,
): Validated<Partial<MenuItemInput>> {
  const record = asRecord(body);
  if (!record) return invalid("Invalid request body");

  const patch: Partial<MenuItemInput> = {};

  if (record.categoryId !== undefined) {
    const categoryId = parseId(record.categoryId);
    if (categoryId === null) return invalid("A valid category is required");
    patch.categoryId = categoryId;
  }

  if (record.name !== undefined) {
    const name = parseName(record.name, MAX_NAME_LENGTH);
    if (!name) {
      return invalid(
        `Item name is required and must be under ${MAX_NAME_LENGTH} characters`,
      );
    }
    patch.name = name;
  }

  if (record.price !== undefined) {
    const price = parsePrice(record.price);
    if (price === null) {
      return invalid("Enter a valid price, for example 220.00");
    }
    patch.price = price;
  }

  if (record.description !== undefined) {
    const description = parseOptionalText(
      record.description,
      MAX_DESCRIPTION_LENGTH,
    );
    if (!description.ok) {
      return invalid(
        `Description must be under ${MAX_DESCRIPTION_LENGTH} characters`,
      );
    }
    patch.description = description.value;
  }

  if (record.imageUrl !== undefined) {
    const imageUrl = parseImageUrl(record.imageUrl, "Image URL");
    if (!imageUrl.ok) return invalid(imageUrl.error);
    patch.imageUrl = imageUrl.value;
  }

  if (record.isPublished !== undefined) {
    if (typeof record.isPublished !== "boolean") {
      return invalid("Published status must be true or false");
    }
    patch.isPublished = record.isPublished;
  }

  if (Object.keys(patch).length === 0) return invalid("Nothing to update");

  return { ok: true, value: patch };
}

export type PublicMenuItem = {
  key: string;
  name: string;
  description: string;
  price: string;
  imageUrl: string | null;
};

export type PublicMenuSection = {
  key: string;
  name: string | null;
  items: PublicMenuItem[];
};

export type PublicMenu = {
  sections: PublicMenuSection[];
  isFallback: boolean;
};

/**
 * Build what the public site renders.
 *
 * Until a café has actually put items in the database, the static demo menu
 * stands in so the page never looks broken. Once real items exist the
 * database is authoritative, and only published items are shown.
 */
export function toPublicMenu(
  categories: MenuCategoryView[],
  fallbackItems: readonly StaticMenuItem[],
): PublicMenu {
  const hasAnyItems = categories.some((category) => category.items.length > 0);

  if (!hasAnyItems) {
    return {
      isFallback: true,
      sections: [
        {
          key: "static-menu",
          name: null,
          items: fallbackItems.map((item, index) => ({
            key: `static-${index}`,
            name: item.name,
            description: item.description,
            price: item.price,
            imageUrl: null,
          })),
        },
      ],
    };
  }

  const sections = categories
    .map((category) => ({
      key: `category-${category.id}`,
      name: category.name,
      items: category.items
        .filter((item) => item.isPublished)
        .map((item) => ({
          key: `item-${item.id}`,
          name: item.name,
          description: item.description ?? "",
          price: formatPrice(item.price),
          imageUrl: item.imageUrl,
        })),
    }))
    .filter((section) => section.items.length > 0);

  return { sections, isFallback: false };
}
