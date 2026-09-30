import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const cafes = pgTable("cafes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  foundedYear: integer("founded_year"),
  tagline: text("tagline"),
  story: text("story"),
  storySecondary: text("story_secondary"),
  whatsapp: text("whatsapp"),
  phone: text("phone"),
  instagram: text("instagram"),
  mapsUrl: text("maps_url"),
  // JSON-encoded string[] — see normalizeStringList in lib/site-cafe.
  address: text("address"),
  heroImage: text("hero_image"),
  galleryImages: text("gallery_images"),
  hours: text("hours"),
});

export const menuCategories = pgTable(
  "menu_categories",
  {
    id: serial("id").primaryKey(),
    cafeId: integer("cafe_id")
      .notNull()
      .references(() => cafes.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("menu_categories_cafe_sort_idx").on(table.cafeId, table.sortOrder),
  ],
);

export const menuItems = pgTable(
  "menu_items",
  {
    id: serial("id").primaryKey(),
    cafeId: integer("cafe_id")
      .notNull()
      .references(() => cafes.id, { onDelete: "cascade" }),
    // Restricted so a category can never be deleted out from under its items.
    categoryId: integer("category_id")
      .notNull()
      .references(() => menuCategories.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    description: text("description"),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    imageUrl: text("image_url"),
    sortOrder: integer("sort_order").notNull().default(0),
    isPublished: boolean("is_published").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("menu_items_cafe_category_sort_idx").on(
      table.cafeId,
      table.categoryId,
      table.sortOrder,
    ),
  ],
);

/**
 * Gallery photos for a café, newest schema for what used to live in the
 * legacy `cafes.gallery_images` JSON column. That column is intentionally
 * kept so existing sites keep their photos until they are backfilled here.
 */
export const galleryImages = pgTable(
  "gallery_images",
  {
    id: serial("id").primaryKey(),
    cafeId: integer("cafe_id")
      .notNull()
      .references(() => cafes.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    /** Null means "describe it from the café name" when rendering. */
    alt: text("alt"),
    sortOrder: integer("sort_order").notNull().default(0),
    isPublished: boolean("is_published").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("gallery_images_cafe_sort_idx").on(table.cafeId, table.sortOrder),
  ],
);

/**
 * Promotional offers shown on the public site.
 *
 * `startDate`/`endDate` are `date` columns in string mode ("YYYY-MM-DD"), not
 * timestamps: a café offer runs for calendar days in its own locality, so
 * storing a wall-clock date avoids the timezone drift a timestamp would
 * introduce. Both bounds are inclusive and optional — see `offerStatus` in
 * lib/offers for the single definition of when an offer is publicly live.
 */
export const offers = pgTable(
  "offers",
  {
    id: serial("id").primaryKey(),
    cafeId: integer("cafe_id")
      .notNull()
      .references(() => cafes.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    /** Free text such as "20% off" or "₹99" — cafés phrase offers in many ways. */
    value: text("value"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    isPublished: boolean("is_published").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("offers_cafe_sort_idx").on(table.cafeId, table.sortOrder)],
);

/**
 * Every photo a café has uploaded to object storage (R2).
 *
 * The bucket holds the bytes; this table records which café owns each
 * object, so storage can be audited, measured per café for billing, and
 * cleaned up when a café leaves (the objects under `cafes/<id>/` can be
 * removed using these keys). Deleting a café cascades these rows only — the
 * objects themselves must be deleted from R2 separately.
 */
export const uploads = pgTable(
  "uploads",
  {
    id: serial("id").primaryKey(),
    cafeId: integer("cafe_id")
      .notNull()
      .references(() => cafes.id, { onDelete: "cascade" }),
    /** Object key in the bucket, always `cafes/<cafeId>/<uuid>.<ext>`. */
    key: text("key").notNull(),
    url: text("url").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uploads_key_unique_idx").on(table.key),
    index("uploads_cafe_created_idx").on(table.cafeId, table.createdAt),
  ],
);

/**
 * A user belongs to exactly one café. Every authenticated request resolves its
 * cafeId from here, never from client input.
 */
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    cafeId: integer("cafe_id")
      .notNull()
      .references(() => cafes.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("users_email_unique_idx").on(table.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    // SHA-256 of the token held by the browser, so a database leak cannot be
    // replayed as a valid session.
    tokenHash: text("token_hash").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("sessions_user_idx").on(table.userId)],
);

export type MenuCategoryRow = typeof menuCategories.$inferSelect;
export type MenuItemRow = typeof menuItems.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type GalleryImageRow = typeof galleryImages.$inferSelect;
export type OfferRow = typeof offers.$inferSelect;
export type UploadRow = typeof uploads.$inferSelect;
