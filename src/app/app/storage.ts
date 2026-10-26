"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";

/**
 * What the customer app remembers on the phone (localStorage), so it feels
 * like an installed app: the table the customer scanned, their cart, their
 * recent orders and their details. Nothing here is trusted by the server:
 * every order is re-checked there.
 *
 * Reads go through useSyncExternalStore, so the server render and the first
 * browser render agree (nothing stored) and every screen updates as soon as
 * anything is saved. Screens that depend on stored data check useHydrated()
 * first, so a slow phone shows a placeholder rather than a wrong empty state.
 *
 * Storage can be unavailable (private browsing, blocked site data, full
 * storage). Values then live in memory instead: ordering still works for the
 * visit, the phone just will not remember it next time.
 */

const KEYS = {
  table: "brewsite.table",
  cart: "brewsite.cart",
  orders: "brewsite.orders",
  customer: "brewsite.customer",
  device: "brewsite.device",
  checkoutKey: "brewsite.checkoutKey",
} as const;

/** A scanned table is remembered for one visit, not forever. */
const TABLE_TTL_MS = 4 * 60 * 60 * 1000;
const MAX_REMEMBERED_ORDERS = 20;
const CHANGE_EVENT = "brewsite-storage";

/**
 * Writes that could not be saved to localStorage, for this visit. Checked
 * first, so a value that failed to save (or to be removed: null) is never
 * hidden by an older saved one.
 */
const memory = new Map<string, string | null>();

function readRaw(key: string): string | null {
  if (memory.has(key)) return memory.get(key) ?? null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  const raw = value === null ? null : JSON.stringify(value);
  try {
    if (raw === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, raw);
    memory.delete(key);
  } catch {
    // Storage unavailable or full: kept in memory for this visit instead.
    memory.set(key, raw);
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

const noSubscribe = () => () => {};

/** False during the server render and the first browser render, then true. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
}

function parse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

function useRaw(key: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => readRaw(key),
    () => null,
  );
}

/** Keeps only cart lines for dishes still on the menu (a dish may have been hidden since). */
export function pruneCart(cart: Cart, menuIds: Set<number>): Cart | null {
  const kept = Object.fromEntries(Object.entries(cart).filter(([id]) => menuIds.has(Number(id))));
  return Object.keys(kept).length === Object.keys(cart).length ? null : kept;
}

/* ------------------------------------------------------------------ table */

export type SavedTable = { token: string; label: string; savedAt: number };

function asTable(value: SavedTable | null): SavedTable | null {
  return value && typeof value.token === "string" && typeof value.label === "string" ? value : null;
}

export function saveTable(token: string, label: string) {
  write(KEYS.table, { token, label, savedAt: Date.now() } satisfies SavedTable);
}

export function forgetTable() {
  write(KEYS.table, null);
}

export function useTable(): SavedTable | null {
  const raw = useRaw(KEYS.table);
  const table = useMemo(() => asTable(parse<SavedTable>(raw)), [raw]);

  // Expire a table remembered from an earlier visit.
  useEffect(() => {
    if (table && Date.now() - table.savedAt > TABLE_TTL_MS) forgetTable();
  }, [table]);

  return table;
}

/* ------------------------------------------------------------------- cart */

/** menuItemId -> quantity */
export type Cart = Record<string, number>;

function asCart(value: Cart | null): Cart {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, quantity]) => Number.isInteger(quantity) && quantity > 0),
  );
}

export function useCart(): Cart {
  const raw = useRaw(KEYS.cart);
  return useMemo(() => asCart(parse<Cart>(raw)), [raw]);
}

export function saveCart(cart: Cart) {
  write(KEYS.cart, Object.keys(cart).length > 0 ? cart : null);
}

/* ----------------------------------------------------------------- orders */

/** `loyalty`: placed with a loyalty number, so its status page carries the stamp card. */
export type SavedOrder = { token: string; number: number; placedAt: number; loyalty?: boolean };

function asOrders(value: SavedOrder[] | null): SavedOrder[] {
  return Array.isArray(value) ? value.filter((order) => typeof order?.token === "string") : [];
}

export function useSavedOrders(): SavedOrder[] {
  const raw = useRaw(KEYS.orders);
  return useMemo(() => asOrders(parse<SavedOrder[]>(raw)), [raw]);
}

export function rememberOrder(token: string, number: number, loyalty: boolean) {
  const existing = asOrders(parse<SavedOrder[]>(readRaw(KEYS.orders)));
  const orders = [{ token, number, placedAt: Date.now(), loyalty }, ...existing.filter((o) => o.token !== token)];
  write(KEYS.orders, orders.slice(0, MAX_REMEMBERED_ORDERS));
}

/* --------------------------------------------------------------- customer */

export type SavedCustomer = { name: string; phone: string; loyalty: boolean };

const EMPTY_CUSTOMER: SavedCustomer = { name: "", phone: "", loyalty: false };

export function useCustomer(): SavedCustomer {
  const raw = useRaw(KEYS.customer);
  return useMemo(() => {
    const customer = parse<SavedCustomer>(raw);
    if (!customer) return EMPTY_CUSTOMER;
    return {
      name: typeof customer.name === "string" ? customer.name : "",
      phone: typeof customer.phone === "string" ? customer.phone : "",
      loyalty: customer.loyalty === true,
    };
  }, [raw]);
}

export function saveCustomer(customer: SavedCustomer) {
  write(KEYS.customer, customer);
}

/* ------------------------------------------------------------ random ids */

/** 32 random hex characters. Works on plain-http addresses too, unlike crypto.randomUUID. */
export function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** A retry key lasts this long: enough to retry through a dropped connection, not into a later visit. */
const CHECKOUT_KEY_TTL_MS = 30 * 60 * 1000;

type CheckoutKey = { key: string; table: string; createdAt: number };

/**
 * The retry key for the order being checked out at `tableToken`. Kept on the
 * phone until the order is confirmed, so trying again (even after leaving
 * the screen) can never place the same order twice. A key from another
 * table, or older than 30 minutes, is replaced: a later visit is a new order.
 */
export function pendingCheckoutKey(tableToken: string): string {
  const existing = parse<CheckoutKey>(readRaw(KEYS.checkoutKey));
  if (
    existing &&
    typeof existing.key === "string" &&
    /^[A-Za-z0-9-]{16,64}$/.test(existing.key) &&
    existing.table === tableToken &&
    typeof existing.createdAt === "number" &&
    Date.now() - existing.createdAt < CHECKOUT_KEY_TTL_MS
  ) {
    return existing.key;
  }
  const key = randomId();
  write(KEYS.checkoutKey, { key, table: tableToken, createdAt: Date.now() } satisfies CheckoutKey);
  return key;
}

export function clearCheckoutKey() {
  write(KEYS.checkoutKey, null);
}

/**
 * A random id for this phone, made once and kept. It identifies nothing
 * about the customer; the café uses it only to slow down repeated orders
 * from one device.
 */
export function deviceId(): string {
  const existing = parse<string>(readRaw(KEYS.device));
  if (typeof existing === "string" && /^[A-Za-z0-9-]{16,64}$/.test(existing)) return existing;
  const id = randomId();
  write(KEYS.device, id);
  return id;
}
