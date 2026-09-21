import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
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
