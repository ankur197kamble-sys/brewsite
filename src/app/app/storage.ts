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
 * anything is saved. Storage can be unavailable (private browsing, blocked
 * site data); the app then works but does not remember.
 */

const KEYS = {
  table: "brewsite.table",
  cart: "brewsite.cart",
  orders: "brewsite.orders",
  customer: "brewsite.customer",
} as const;

/** A scanned table is remembered for one visit, not forever. */
const TABLE_TTL_MS = 4 * 60 * 60 * 1000;
const MAX_REMEMBERED_ORDERS = 20;
const CHANGE_EVENT = "brewsite-storage";

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: the app works, it just will not remember.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
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
