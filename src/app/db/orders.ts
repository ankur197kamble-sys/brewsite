import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/app/db";
import {
  cafeTables,
  loyaltyCards,
  menuCategories,
  menuItems,
  orderItems,
  orders,
  type OrderRow,
} from "@/app/db/schema";
import {
  ACTIVE_STATUSES,
  canMoveTo,
  isOrderStatus,
  MAX_ORDER_TOTAL_PAISE,
  priceToPaise,
  rewardsAvailable,
  STAMPS_PER_REWARD,
  type LoyaltyView,
  type OrderInput,
  type OrderLineView,
  type OrderStatus,
  type PublicOrderView,
  type StaffOrderView,
  type TableView,
  type TodayTotals,
} from "@/app/lib/orders";
import { CAFE_TIME_ZONE } from "@/app/lib/cafe-time";

/**
 * Ordering data access. Staff functions take the cafeId from the session and
 * filter on it, like every other module. Customer functions are reached only
 * through an unguessable token (a table's QR token or an order's public
 * token), which itself determines the café.
 */

export function newToken(): string {
  return randomBytes(18).toString("base64url");
}

/* ------------------------------------------------------------------ tables */

const toTableView = (row: typeof cafeTables.$inferSelect): TableView => ({
  id: row.id,
  label: row.label,
  token: row.token,
  isActive: row.isActive,
});

export async function listTables(cafeId: number): Promise<TableView[]> {
  const rows = await db
    .select()
    .from(cafeTables)
    .where(eq(cafeTables.cafeId, cafeId))
    .orderBy(asc(cafeTables.sortOrder), asc(cafeTables.id));
  return rows.map(toTableView);
}

export async function createTable(cafeId: number, label: string): Promise<TableView> {
  const existing = await db
    .select({ sortOrder: cafeTables.sortOrder })
    .from(cafeTables)
    .where(eq(cafeTables.cafeId, cafeId));
  const sortOrder = existing.reduce((max, row) => Math.max(max, row.sortOrder + 1), 0);

  const [row] = await db
    .insert(cafeTables)
    .values({ cafeId, label, token: newToken(), sortOrder })
    .returning();
  return toTableView(row);
}

export type TablePatch = { label?: string; isActive?: boolean; newToken?: boolean };

export async function updateTable(
  cafeId: number,
  tableId: number,
  patch: TablePatch,
): Promise<TableView | undefined> {
  const [row] = await db
    .update(cafeTables)
    .set({
      ...(patch.label !== undefined ? { label: patch.label } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      // A new token makes every printed copy of the old QR code stop working.
      ...(patch.newToken ? { token: newToken() } : {}),
    })
    .where(and(eq(cafeTables.cafeId, cafeId), eq(cafeTables.id, tableId)))
    .returning();
  return row ? toTableView(row) : undefined;
}

export async function deleteTable(cafeId: number, tableId: number): Promise<boolean> {
  // Past orders keep their copied table label (table_id becomes null).
  const [row] = await db
    .delete(cafeTables)
    .where(and(eq(cafeTables.cafeId, cafeId), eq(cafeTables.id, tableId)))
    .returning({ id: cafeTables.id });
  return Boolean(row);
}

/** An active table by its QR token, with the café it belongs to. */
export async function getActiveTableByToken(token: string) {
  const [row] = await db
    .select()
    .from(cafeTables)
    .where(and(eq(cafeTables.token, token), eq(cafeTables.isActive, true)))
    .limit(1);
  return row;
}

/* ------------------------------------------------------------- placing */

/**
 * Spam limits within RATE_WINDOW_SECONDS.
 * - Per phone (the app's random id): stops one customer's accidental or
 *   playful repeats. A script can rotate the id, so it is not the ceiling.
 * - Per table: the real ceiling for anyone holding a table's QR code, with
 *   room for a shared "Counter" QR at a busy moment.
 * - Per network: every customer on the café's Wi-Fi shares one internet
 *   address, so this is set for a full café, as a backstop across tables.
 * Orders staff have cancelled are not counted.
 */
const RATE_WINDOW_SECONDS = 10 * 60;
export const MAX_ORDERS_PER_DEVICE = 6;
export const MAX_ORDERS_PER_TABLE = 15;
export const MAX_ORDERS_PER_NETWORK = 30;

/** pg_advisory_xact_lock(ORDER_LOCK, cafeId): one order at a time per café. */
const ORDER_LOCK = 0x6f72; // "or"

export type RateLimit = "device" | "table" | "network";

export type PlaceOrderResult =
  | { status: "ok"; token: string; number: number }
  | { status: "unknown_table" }
  | { status: "unavailable_items"; names: string[] }
  | { status: "too_large" }
  | { status: "rate_limited"; limit: RateLimit }
  /** The retry key belongs to an order that went through with different contents. */
  | { status: "already_placed"; token: string; number: number };

type PlaceOutcome = "ok" | "existing" | "already_placed" | `limit_${RateLimit}`;

/**
 * True when order `o` is exactly what this request asks for: same table,
 * name, number, note and dishes. A retry is only "the same order" if nothing
 * was changed in between; otherwise the customer is told the earlier one
 * went through, instead of their changes being dropped without a word.
 */
function sameOrderAs(input: OrderInput, tableId: SQL) {
  const requested = JSON.stringify(
    input.lines.map((line) => ({ menu_item_id: line.menuItemId, quantity: line.quantity })),
  );
  return sql`(
    o.table_id IS NOT DISTINCT FROM ${tableId}
    AND o.customer_name = ${input.customerName}::text
    AND o.customer_phone IS NOT DISTINCT FROM ${input.customerPhone}::text
    AND o.note IS NOT DISTINCT FROM ${input.note}::text
    AND (
      SELECT jsonb_agg(jsonb_build_object('menu_item_id', i.menu_item_id, 'quantity', i.quantity) ORDER BY i.menu_item_id)
      FROM ${orderItems} i WHERE i.order_id = o.id
    ) = (
      SELECT jsonb_agg(jsonb_build_object('menu_item_id', r.menu_item_id, 'quantity', r.quantity) ORDER BY r.menu_item_id)
      FROM jsonb_to_recordset(${requested}::jsonb) AS r(menu_item_id int, quantity int)
    )
  )`;
}

/**
 * A retry of an order that already went through, found by its key before
 * anything else is checked: by then a dish may have sold out or the table's
 * QR been switched off, and the customer must still get their order back.
 */
async function findRetriedOrder(input: OrderInput): Promise<PlaceOrderResult | null> {
  if (!input.idempotencyKey) return null;
  const result = await db.execute(sql`
    SELECT o.order_number, o.public_token, ${sameOrderAs(input, sql`t.id`)} AS same
    FROM ${orders} o
    JOIN ${cafeTables} t ON t.cafe_id = o.cafe_id
    WHERE t.token = ${input.tableToken}::text AND o.idempotency_key = ${input.idempotencyKey}::text
    LIMIT 1
  `);
  const row = result.rows[0] as { order_number: number; public_token: string; same: boolean } | undefined;
  if (!row) return null;
  const same = Boolean(row.same);
  return { status: same ? "ok" : "already_placed", token: row.public_token, number: Number(row.order_number) };
}

/**
 * Places an order from a table's QR token. Item names and prices come from
 * the database — the client sends only ids and quantities — and only
 * published items from that table's own café can be ordered.
 *
 * The limit checks, the retry check, the day's order number and the insert
 * run in one transaction behind a per-café lock. Neon's HTTP driver has no
 * interactive transactions, so this is a batch of two statements: the lock,
 * then one statement that reads (with a snapshot taken after the lock) and
 * writes. Parallel requests therefore cannot slip past a limit, two orders
 * can never get the same number, and a retry of the same checkout (same
 * idempotency key) returns the original order instead of a second one.
 */
export async function placeOrder(
  input: OrderInput,
  clientHash: string,
  deviceHash: string,
): Promise<PlaceOrderResult> {
  const retried = await findRetriedOrder(input);
  if (retried) return retried;

  const table = await getActiveTableByToken(input.tableToken);
  if (!table) return { status: "unknown_table" };
  const cafeId = table.cafeId;

  const ids = input.lines.map((line) => line.menuItemId);
  const available = await db
    .select({ id: menuItems.id, name: menuItems.name, price: menuItems.price })
    .from(menuItems)
    .innerJoin(menuCategories, eq(menuItems.categoryId, menuCategories.id))
    .where(
      and(
        eq(menuItems.cafeId, cafeId),
        eq(menuCategories.cafeId, cafeId),
        eq(menuItems.isPublished, true),
        inArray(menuItems.id, ids),
      ),
    );
  const byId = new Map(available.map((item) => [item.id, item]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    return { status: "unavailable_items", names: missing.map((id) => `#${id}`) };
  }

  const lines = input.lines.map((line) => {
    const item = byId.get(line.menuItemId)!;
    return {
      menu_item_id: item.id,
      name: item.name,
      unit_price_paise: priceToPaise(item.price),
      quantity: line.quantity,
    };
  });
  // A dish priced at zero is a placeholder, never something to sell.
  const unpriced = lines.filter((line) => line.unit_price_paise <= 0);
  if (unpriced.length > 0) {
    return { status: "unavailable_items", names: unpriced.map((line) => line.name) };
  }
  const total = lines.reduce((sum, line) => sum + line.unit_price_paise * line.quantity, 0);
  // Also keeps every amount inside the 32-bit paise columns.
  if (lines.some((line) => line.unit_price_paise > MAX_ORDER_TOTAL_PAISE) || total > MAX_ORDER_TOTAL_PAISE) {
    return { status: "too_large" };
  }
  const token = newToken();

  const [, placed] = await db.batch([
    db.execute(sql`SELECT pg_advisory_xact_lock(${ORDER_LOCK}::int, ${cafeId}::int)`),
    // One statement, so an order can never exist without its items.
    db.execute(sql`
      WITH existing AS (
        -- The same key placed moments ago by a parallel request.
        SELECT o.order_number, o.public_token, ${sameOrderAs(input, sql`${table.id}::int`)} AS same
        FROM ${orders} o
        WHERE o.cafe_id = ${cafeId}::int AND o.idempotency_key = ${input.idempotencyKey}::text
      ), recent AS (
        SELECT
          count(*) FILTER (WHERE device_hash = ${deviceHash}::text)::int AS by_device,
          count(*) FILTER (WHERE table_id = ${table.id}::int)::int AS by_table,
          count(*) FILTER (WHERE client_hash = ${clientHash}::text)::int AS by_network
        FROM ${orders}
        WHERE cafe_id = ${cafeId}::int
          AND created_at >= now() - make_interval(secs => ${RATE_WINDOW_SECONDS}::int)
          -- Orders staff cancelled do not count, so cancelling a burst of
          -- fake orders frees the table for real customers straight away.
          AND status <> 'cancelled'
      ), verdict AS (
        SELECT CASE
          WHEN EXISTS (SELECT 1 FROM existing WHERE same) THEN 'existing'
          WHEN EXISTS (SELECT 1 FROM existing) THEN 'already_placed'
          WHEN by_device >= ${MAX_ORDERS_PER_DEVICE}::int THEN 'limit_device'
          WHEN by_table >= ${MAX_ORDERS_PER_TABLE}::int THEN 'limit_table'
          WHEN by_network >= ${MAX_ORDERS_PER_NETWORK}::int THEN 'limit_network'
          ELSE 'ok'
        END AS outcome
        FROM recent
      ), next_number AS (
        -- Numbers restart at 1 each day, in the café's time zone.
        SELECT coalesce(max(order_number), 0) + 1 AS n FROM ${orders}
        WHERE cafe_id = ${cafeId}::int
          AND created_at >= date_trunc('day', now() AT TIME ZONE ${CAFE_TIME_ZONE}::text) AT TIME ZONE ${CAFE_TIME_ZONE}::text
      ), new_order AS (
        INSERT INTO ${orders} (
          cafe_id, table_id, table_label, public_token, order_number, idempotency_key,
          customer_name, customer_phone, note, total_paise, client_hash, device_hash
        )
        SELECT
          ${cafeId}::int, ${table.id}::int, ${table.label}::text, ${token}::text, next_number.n,
          ${input.idempotencyKey}::text, ${input.customerName}::text, ${input.customerPhone}::text,
          ${input.note}::text, ${total}::int, ${clientHash}::text, ${deviceHash}::text
        FROM next_number, verdict
        WHERE verdict.outcome = 'ok'
        RETURNING id, order_number, public_token
      ), new_items AS (
        INSERT INTO ${orderItems} (order_id, cafe_id, menu_item_id, name, unit_price_paise, quantity)
        SELECT new_order.id, ${cafeId}::int, l.menu_item_id, l.name, l.unit_price_paise, l.quantity
        FROM new_order, jsonb_to_recordset(${JSON.stringify(lines)}::jsonb)
          AS l(menu_item_id int, name text, unit_price_paise int, quantity int)
        RETURNING 1
      )
      SELECT
        verdict.outcome,
        coalesce((SELECT order_number FROM new_order), (SELECT order_number FROM existing)) AS order_number,
        coalesce((SELECT public_token FROM new_order), (SELECT public_token FROM existing)) AS public_token
      FROM verdict
    `),
  ]);

  const row = placed.rows[0] as { outcome: PlaceOutcome; order_number: number | null; public_token: string | null };
  if (row.outcome === "ok" || row.outcome === "existing") {
    return { status: "ok", token: String(row.public_token), number: Number(row.order_number) };
  }
  if (row.outcome === "already_placed") {
    return { status: "already_placed", token: String(row.public_token), number: Number(row.order_number) };
  }
  return { status: "rate_limited", limit: row.outcome.slice("limit_".length) as RateLimit };
}

/* ------------------------------------------------------------- reading */

async function linesFor(orderIds: number[]): Promise<Map<number, OrderLineView[]>> {
  const map = new Map<number, OrderLineView[]>();
  if (orderIds.length === 0) return map;
  const rows = await db
    .select()
    .from(orderItems)
    .where(inArray(orderItems.orderId, orderIds))
    .orderBy(asc(orderItems.id));
  for (const row of rows) {
    const list = map.get(row.orderId) ?? [];
    list.push({ name: row.name, quantity: row.quantity, unitPricePaise: row.unitPricePaise });
    map.set(row.orderId, list);
  }
  return map;
}

function statusOf(row: OrderRow): OrderStatus {
  return isOrderStatus(row.status) ? row.status : "received";
}

/** The customer's view of their own order, by its public token. */
export async function getPublicOrder(token: string): Promise<PublicOrderView | undefined> {
  const [row] = await db.select().from(orders).where(eq(orders.publicToken, token)).limit(1);
  if (!row) return undefined;

  const lines = (await linesFor([row.id])).get(row.id) ?? [];
  const status = statusOf(row);
  let loyalty: PublicOrderView["loyalty"] = null;
  if (row.customerPhone) {
    // The card only after this order was collected and paid in person: the
    // number is not verified, so it must not open someone else's card.
    let card: { stamps: number; rewardsAvailable: number } | null = null;
    if (status === "completed") {
      const [found] = await db
        .select()
        .from(loyaltyCards)
        .where(and(eq(loyaltyCards.cafeId, row.cafeId), eq(loyaltyCards.phone, row.customerPhone)))
        .limit(1);
      card = {
        stamps: found?.stamps ?? 0,
        rewardsAvailable: found ? rewardsAvailable(found.stamps, found.rewardsRedeemed) : 0,
      };
    }
    loyalty = { phone: row.customerPhone.slice(-4), card };
  }

  return {
    token: row.publicToken,
    number: row.orderNumber,
    status,
    tableLabel: row.tableLabel,
    customerName: row.customerName,
    totalPaise: row.totalPaise,
    createdAt: row.createdAt.toISOString(),
    lines,
    loyalty,
  };
}

/** Staff list: every active order, plus orders finished in the last 12 hours. */
export async function listStaffOrders(cafeId: number): Promise<StaffOrderView[]> {
  const since = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.cafeId, cafeId),
        sql`(${inArray(orders.status, ACTIVE_STATUSES)} OR ${orders.createdAt} >= ${since})`,
      ),
    )
    .orderBy(desc(orders.createdAt))
    .limit(200);

  const lines = await linesFor(rows.map((row) => row.id));
  return rows.map((row) => ({
    id: row.id,
    number: row.orderNumber,
    status: statusOf(row),
    tableLabel: row.tableLabel,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    note: row.note,
    totalPaise: row.totalPaise,
    createdAt: row.createdAt.toISOString(),
    lines: lines.get(row.id) ?? [],
  }));
}

/**
 * Today's orders, and those collected and paid, since midnight in the café's
 * time zone. Counted in the database, so a long day is never cut short by
 * the staff list's 12-hour window.
 */
export async function todayTotals(cafeId: number): Promise<TodayTotals> {
  const [row] = await db
    .select({
      orders: sql<number>`count(*)::int`,
      collected: sql<number>`count(*) filter (where ${orders.status} = 'completed')::int`,
      collectedPaise: sql<number>`coalesce(sum(${orders.totalPaise}) filter (where ${orders.status} = 'completed'), 0)::int`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.cafeId, cafeId),
        sql`${orders.createdAt} >= date_trunc('day', now() AT TIME ZONE ${CAFE_TIME_ZONE}::text) AT TIME ZONE ${CAFE_TIME_ZONE}::text`,
      ),
    );
  return { orders: row?.orders ?? 0, collected: row?.collected ?? 0, collectedPaise: row?.collectedPaise ?? 0 };
}

/* ------------------------------------------------------------ updating */

export type UpdateStatusResult =
  | { status: "ok" }
  | { status: "not_found" }
  | { status: "invalid_transition"; from: OrderStatus };

/**
 * Moves an order to a new status. Completing an order with a loyalty phone
 * adds one stamp in the same statement, guarded by the status check, so a
 * double tap or two staff phones can never award two stamps.
 */
export async function updateOrderStatus(
  cafeId: number,
  orderId: number,
  to: OrderStatus,
): Promise<UpdateStatusResult> {
  const [current] = await db
    .select({ status: orders.status })
    .from(orders)
    .where(and(eq(orders.cafeId, cafeId), eq(orders.id, orderId)))
    .limit(1);
  if (!current) return { status: "not_found" };
  const from = isOrderStatus(current.status) ? current.status : "received";
  if (!canMoveTo(from, to)) return { status: "invalid_transition", from };

  const result = await db.execute(sql`
    WITH moved AS (
      UPDATE ${orders} SET status = ${to}, updated_at = now()
      WHERE id = ${orderId} AND cafe_id = ${cafeId} AND status = ${from}
      RETURNING cafe_id, customer_phone
    ), stamped AS (
      INSERT INTO ${loyaltyCards} (cafe_id, phone, stamps)
      SELECT cafe_id, customer_phone, 1 FROM moved
      WHERE ${to} = 'completed' AND customer_phone IS NOT NULL
      ON CONFLICT (cafe_id, phone)
      DO UPDATE SET stamps = ${loyaltyCards}.stamps + 1, updated_at = now()
      RETURNING 1
    )
    SELECT count(*)::int AS moved FROM moved
  `);
  const moved = Number((result.rows[0] as { moved: number }).moved);
  if (moved === 0) {
    // Someone else changed it in between: report the state it is really in.
    const [now] = await db
      .select({ status: orders.status })
      .from(orders)
      .where(and(eq(orders.cafeId, cafeId), eq(orders.id, orderId)))
      .limit(1);
    if (!now) return { status: "not_found" };
    return { status: "invalid_transition", from: isOrderStatus(now.status) ? now.status : from };
  }
  return { status: "ok" };
}

/* -------------------------------------------------------------- loyalty */

export async function getLoyaltyCard(cafeId: number, phone: string): Promise<LoyaltyView> {
  const [card] = await db
    .select()
    .from(loyaltyCards)
    .where(and(eq(loyaltyCards.cafeId, cafeId), eq(loyaltyCards.phone, phone)))
    .limit(1);
  const stamps = card?.stamps ?? 0;
  const redeemed = card?.rewardsRedeemed ?? 0;
  return { phone, stamps, rewardsRedeemed: redeemed, rewardsAvailable: rewardsAvailable(stamps, redeemed) };
}

/** Redeems one reward if one is available; the check and update are one statement. */
export async function redeemReward(cafeId: number, phone: string): Promise<LoyaltyView | undefined> {
  const [row] = await db
    .update(loyaltyCards)
    .set({ rewardsRedeemed: sql`${loyaltyCards.rewardsRedeemed} + 1`, updatedAt: new Date() })
    .where(
      and(
        eq(loyaltyCards.cafeId, cafeId),
        eq(loyaltyCards.phone, phone),
        sql`(${loyaltyCards.stamps} / ${STAMPS_PER_REWARD}::int) > ${loyaltyCards.rewardsRedeemed}`,
      ),
    )
    .returning();
  if (!row) return undefined;
  return {
    phone,
    stamps: row.stamps,
    rewardsRedeemed: row.rewardsRedeemed,
    rewardsAvailable: rewardsAvailable(row.stamps, row.rewardsRedeemed),
  };
}
