import { asRecord } from "@/app/lib/json";
import { invalid, parseId, type Validated } from "@/app/lib/validation";

/**
 * Ordering rules shared by the customer app (which builds orders) and the
 * API (which enforces them). Free of server-only imports.
 *
 * Money is handled in whole paise (integers) everywhere, so totals never
 * pick up floating-point rounding errors.
 */

export const ORDER_STATUSES = [
  "received",
  "preparing",
  "ready",
  "completed",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Statuses an order moves through, in order. */
const PROGRESSION: OrderStatus[] = ["received", "preparing", "ready", "completed"];

export const ACTIVE_STATUSES: OrderStatus[] = ["received", "preparing", "ready"];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  received: "Received",
  preparing: "Preparing",
  ready: "Ready to collect",
  completed: "Completed",
  cancelled: "Cancelled",
};

/**
 * Staff may move an order forward (skipping steps is fine, e.g. straight to
 * "ready") or cancel it while it is still active. Completed and cancelled
 * orders are final.
 */
export function canMoveTo(from: OrderStatus, to: OrderStatus): boolean {
  if (from === "completed" || from === "cancelled") return false;
  if (to === "cancelled") return true;
  return PROGRESSION.indexOf(to) > PROGRESSION.indexOf(from);
}

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}

/** One stamp per completed order; this many stamps earn one reward. */
export const STAMPS_PER_REWARD = 10;

export function rewardsAvailable(stamps: number, redeemed: number): number {
  return Math.max(0, Math.floor(stamps / STAMPS_PER_REWARD) - redeemed);
}

/** Stamps collected towards the next reward, 0..STAMPS_PER_REWARD-1. */
export function stampsTowardsNext(stamps: number): number {
  return stamps % STAMPS_PER_REWARD;
}

/**
 * Stamps to draw on the card. A card that was just completed stays full
 * until its treat is redeemed, rather than looking empty with a treat waiting.
 */
export function stampsOnCard(stamps: number, rewardsAvailable: number): number {
  const towards = stampsTowardsNext(stamps);
  return towards === 0 && stamps > 0 && rewardsAvailable > 0 ? STAMPS_PER_REWARD : towards;
}

/* ----------------------------------------------------------------- money */

/** "249.50" (a numeric price column) -> 24950 paise. */
export function priceToPaise(price: string | number): number {
  return Math.round(Number(price) * 100);
}

/** 24950 -> "₹249.50", 24900 -> "₹249". */
export function formatPaise(paise: number): string {
  const rupees = paise / 100;
  return `₹${Number.isInteger(rupees) ? rupees : rupees.toFixed(2)}`;
}

/* ----------------------------------------------------------------- phone */

/**
 * Indian mobile numbers in any common format ("98765 43210", "+91-98765
 * 43210", "09876543210") -> "919876543210". Anything else -> null.
 */
export function normalizeIndianMobile(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  return `91${digits}`;
}

/** "919876543210" -> "•••••• 3210", for screens that must not show the number. */
export function maskPhone(phone: string): string {
  return `•••••• ${phone.slice(-4)}`;
}

/* ------------------------------------------------------------ validation */

export const MAX_ORDER_LINES = 30;
export const MAX_ITEM_QUANTITY = 20;
const MAX_NAME_LENGTH = 40;
const MAX_NOTE_LENGTH = 200;

export type OrderLineInput = { menuItemId: number; quantity: number };

export type OrderInput = {
  tableToken: string;
  lines: OrderLineInput[];
  customerName: string;
  /** Normalized mobile, only when the customer opted in to loyalty stamps. */
  customerPhone: string | null;
  note: string | null;
};

/**
 * Validates a customer's order. Only ids and quantities are accepted from
 * the browser: names and prices are always read from the database.
 */
export function validateOrderInput(body: unknown): Validated<OrderInput> {
  const record = asRecord(body);
  if (!record) return invalid("Invalid order");

  const { tableToken } = record;
  if (typeof tableToken !== "string" || !/^[A-Za-z0-9_-]{16,64}$/.test(tableToken)) {
    return invalid("Scan the QR code on your table to order");
  }

  if (!Array.isArray(record.items) || record.items.length === 0) {
    return invalid("Your order is empty");
  }
  if (record.items.length > MAX_ORDER_LINES) return invalid("Too many items in one order");

  // Merge repeated dishes so one line per dish reaches the kitchen.
  const quantities = new Map<number, number>();
  for (const entry of record.items) {
    const item = asRecord(entry);
    const menuItemId = parseId(item?.menuItemId);
    const quantity = item?.quantity;
    if (menuItemId === null || typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1) {
      return invalid("Your order has an invalid item");
    }
    quantities.set(menuItemId, (quantities.get(menuItemId) ?? 0) + quantity);
  }
  for (const quantity of quantities.values()) {
    if (quantity > MAX_ITEM_QUANTITY) {
      return invalid(`You can order at most ${MAX_ITEM_QUANTITY} of one item`);
    }
  }

  const name = typeof record.customerName === "string" ? record.customerName.trim() : "";
  if (!name) return invalid("Please enter your name, so staff can call you");
  if (name.length > MAX_NAME_LENGTH) return invalid(`Name must be under ${MAX_NAME_LENGTH} characters`);

  let customerPhone: string | null = null;
  if (record.loyalty === true) {
    customerPhone = normalizeIndianMobile(record.customerPhone);
    if (!customerPhone) return invalid("Enter a valid 10-digit mobile number for loyalty stamps");
  }

  let note: string | null = null;
  if (record.note !== undefined && record.note !== null) {
    if (typeof record.note !== "string") return invalid("Invalid note");
    note = record.note.trim() || null;
    if (note && note.length > MAX_NOTE_LENGTH) return invalid(`Note must be under ${MAX_NOTE_LENGTH} characters`);
  }

  return {
    ok: true,
    value: {
      tableToken,
      lines: [...quantities].map(([menuItemId, quantity]) => ({ menuItemId, quantity })),
      customerName: name,
      customerPhone,
      note,
    },
  };
}

/* ------------------------------------------------------------- views */

export type OrderLineView = {
  name: string;
  quantity: number;
  unitPricePaise: number;
};

/** What the customer's phone may see about its own order. */
export type PublicOrderView = {
  token: string;
  number: number;
  status: OrderStatus;
  tableLabel: string;
  customerName: string;
  totalPaise: number;
  createdAt: string;
  lines: OrderLineView[];
  loyalty: { phone: string; stamps: number; rewardsAvailable: number } | null;
};

/** What staff see on the orders screen. */
export type StaffOrderView = {
  id: number;
  number: number;
  status: OrderStatus;
  tableLabel: string;
  customerName: string;
  customerPhone: string | null;
  note: string | null;
  totalPaise: number;
  createdAt: string;
  lines: OrderLineView[];
};

export type TableView = {
  id: number;
  label: string;
  token: string;
  isActive: boolean;
};

export type LoyaltyView = {
  phone: string;
  stamps: number;
  rewardsRedeemed: number;
  rewardsAvailable: number;
};

/** Short order number shown to staff and customer ("#1042"). */
export function orderNumber(id: number): number {
  return 1000 + id;
}

const LABEL_MAX = 40;

export function validateTableLabel(value: unknown): Validated<string> {
  if (typeof value !== "string" || !value.trim()) return invalid("Give the table a name, e.g. Table 1");
  const label = value.trim();
  if (label.length > LABEL_MAX) return invalid(`Table name must be under ${LABEL_MAX} characters`);
  return { ok: true, value: label };
}
