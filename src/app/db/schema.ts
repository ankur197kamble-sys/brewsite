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
  /** Short line above the hero headline, e.g. "Fresh brews · Comfort bites". */
  highlights: text("highlights"),
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

/**
 * Failed sign-in attempts, kept briefly to slow down password guessing (see
 * src/app/api/auth/login). `key` is a salted hash of "email:<address>" or
 * "ip:<address>", never the address itself. Like sessions, not backed up.
 */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("login_attempts_key_created_idx").on(table.key, table.createdAt)],
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

/* ------------------------------------------------------------ ordering */

/**
 * A place an order can come from: a dining table, or e.g. "Counter" for
 * takeaway. Each has a long random `token` printed as a QR code; scanning it
 * is what lets a customer order. The token, not a guessable id, identifies
 * the table, and it resolves the café — so ordering works per café without
 * trusting anything else the browser sends.
 */
export const cafeTables = pgTable(
  "cafe_tables",
  {
    id: serial("id").primaryKey(),
    cafeId: integer("cafe_id")
      .notNull()
      .references(() => cafes.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    token: text("token").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("cafe_tables_token_unique_idx").on(table.token),
    index("cafe_tables_cafe_sort_idx").on(table.cafeId, table.sortOrder),
  ],
);

/**
 * An order placed by a customer, paid at the counter. Prices are copied
 * into order_items when the order is placed, so later menu edits never
 * change what an existing order costs.
 *
 * `publicToken` lets the customer's phone follow its own order without an
 * account; it is long and random, and the status page shows no phone number.
 */
export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    cafeId: integer("cafe_id")
      .notNull()
      .references(() => cafes.id, { onDelete: "cascade" }),
    tableId: integer("table_id").references(() => cafeTables.id, {
      onDelete: "set null",
    }),
    /** Copied so the order still reads correctly if the table is renamed. */
    tableLabel: text("table_label").notNull(),
    publicToken: text("public_token").notNull(),
    /**
     * What staff call out: 1, 2, 3… starting again each day (café time), so
     * numbers stay short and reveal nothing about other cafés.
     */
    orderNumber: integer("order_number").notNull(),
    /**
     * Sent by the phone with each checkout attempt. A retry after a lost
     * response carries the same key and gets the original order back.
     */
    idempotencyKey: text("idempotency_key"),
    customerName: text("customer_name").notNull(),
    /** Only when the customer opts in to loyalty stamps. */
    customerPhone: text("customer_phone"),
    note: text("note"),
    /** received → preparing → ready → completed, or cancelled. */
    status: text("status").notNull().default("received"),
    totalPaise: integer("total_paise").notNull(),
    /** SHA-256 of the client IP with a server secret, for rate limiting only. */
    clientHash: text("client_hash"),
    /** SHA-256 of the phone's random app id with a server secret, for rate limiting only. */
    deviceHash: text("device_hash"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("orders_public_token_unique_idx").on(table.publicToken),
    uniqueIndex("orders_cafe_idempotency_unique_idx").on(table.cafeId, table.idempotencyKey),
    // Rate limits, today's numbering and today's totals all read recent orders.
    index("orders_cafe_created_idx").on(table.cafeId, table.createdAt),
    index("orders_cafe_status_created_idx").on(
      table.cafeId,
      table.status,
      table.createdAt,
    ),
    index("orders_table_created_idx").on(table.tableId, table.createdAt),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    cafeId: integer("cafe_id")
      .notNull()
      .references(() => cafes.id, { onDelete: "cascade" }),
    menuItemId: integer("menu_item_id").references(() => menuItems.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    unitPricePaise: integer("unit_price_paise").notNull(),
    quantity: integer("quantity").notNull(),
  },
  (table) => [index("order_items_order_idx").on(table.orderId)],
);

/**
 * Loyalty stamps per café and phone number. One stamp per completed order;
 * every STAMPS_PER_REWARD stamps earns a reward the staff can redeem.
 */
export const loyaltyCards = pgTable(
  "loyalty_cards",
  {
    id: serial("id").primaryKey(),
    cafeId: integer("cafe_id")
      .notNull()
      .references(() => cafes.id, { onDelete: "cascade" }),
    phone: text("phone").notNull(),
    stamps: integer("stamps").notNull().default(0),
    rewardsRedeemed: integer("rewards_redeemed").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("loyalty_cards_cafe_phone_unique_idx").on(
      table.cafeId,
      table.phone,
    ),
  ],
);

export type CafeTableRow = typeof cafeTables.$inferSelect;
export type OrderRow = typeof orders.$inferSelect;
export type OrderItemRow = typeof orderItems.$inferSelect;
export type LoyaltyCardRow = typeof loyaltyCards.$inferSelect;
