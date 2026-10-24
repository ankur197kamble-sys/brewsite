import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
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
  orderNumber,
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
} from "@/app/lib/orders";

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

/** Per table and per client, within RATE_WINDOW_MS, to stop spam orders. */
const RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_ORDERS_PER_TABLE = 8;
const MAX_ORDERS_PER_CLIENT = 6;

export type PlaceOrderResult =
  | { status: "ok"; token: string; number: number }
  | { status: "unknown_table" }
  | { status: "unavailable_items"; names: string[] }
  | { status: "rate_limited" };

/**
 * Places an order from a table's QR token. Item names and prices come from
 * the database — the client sends only ids and quantities — and only
 * published items from that table's own café can be ordered.
 */
export async function placeOrder(input: OrderInput, clientHash: string | null): Promise<PlaceOrderResult> {
  const table = await getActiveTableByToken(input.tableToken);
  if (!table) return { status: "unknown_table" };
  const cafeId = table.cafeId;

  const since = new Date(Date.now() - RATE_WINDOW_MS);
  const [{ byTable, byClient }] = await db
    .select({
      byTable: sql<number>`count(*) filter (where ${orders.tableId} = ${table.id})::int`,
      byClient: clientHash
        ? sql<number>`count(*) filter (where ${orders.clientHash} = ${clientHash})::int`
        : sql<number>`0`,
    })
    .from(orders)
    .where(and(eq(orders.cafeId, cafeId), gte(orders.createdAt, since)));
  if (byTable >= MAX_ORDERS_PER_TABLE || byClient >= MAX_ORDERS_PER_CLIENT) {
    return { status: "rate_limited" };
  }

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
  const token = newToken();

  // One statement, so an order can never exist without its items.
  const result = await db.execute(sql`
    WITH new_order AS (
      INSERT INTO ${orders} (cafe_id, table_id, table_label, public_token, customer_name, customer_phone, note, total_paise, client_hash)
      VALUES (${cafeId}, ${table.id}, ${table.label}, ${token}, ${input.customerName}, ${input.customerPhone}, ${input.note}, ${total}, ${clientHash})
      RETURNING id
    ), new_items AS (
      INSERT INTO ${orderItems} (order_id, cafe_id, menu_item_id, name, unit_price_paise, quantity)
      SELECT new_order.id, ${cafeId}, l.menu_item_id, l.name, l.unit_price_paise, l.quantity
      FROM new_order, jsonb_to_recordset(${JSON.stringify(lines)}::jsonb)
        AS l(menu_item_id int, name text, unit_price_paise int, quantity int)
      RETURNING 1
    )
    SELECT id FROM new_order
  `);
  const id = Number((result.rows[0] as { id: number }).id);
  return { status: "ok", token, number: orderNumber(id) };
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
  let loyalty: PublicOrderView["loyalty"] = null;
  if (row.customerPhone) {
    const [card] = await db
      .select()
      .from(loyaltyCards)
      .where(and(eq(loyaltyCards.cafeId, row.cafeId), eq(loyaltyCards.phone, row.customerPhone)))
      .limit(1);
    loyalty = {
      phone: row.customerPhone.slice(-4),
      stamps: card?.stamps ?? 0,
      rewardsAvailable: card ? rewardsAvailable(card.stamps, card.rewardsRedeemed) : 0,
    };
  }

  return {
    token: row.publicToken,
    number: orderNumber(row.id),
    status: statusOf(row),
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
    number: orderNumber(row.id),
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

export async function countOrdersSince(cafeId: number, since: Date): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .where(and(eq(orders.cafeId, cafeId), gte(orders.createdAt, since)));
  return row?.n ?? 0;
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
  // Someone else changed it in between: report the state it is really in.
  if (moved === 0) return { status: "invalid_transition", from };
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
