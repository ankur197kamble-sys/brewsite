"use client";

import Link from "next/link";
import { formatPaise, STATUS_LABEL } from "@/app/lib/orders";
import { CAFE_TIME_ZONE } from "@/app/lib/cafe-time";
import { useHydrated, useSavedOrders, type SavedOrder } from "../storage";
import { usePublicOrder } from "../use-order";

const SHOWN = 10;

/**
 * Orders placed from this phone, newest first. Every row keeps itself up to
 * date while its order is in progress (finished orders are read once).
 */
export function OrdersList() {
  const hydrated = useHydrated();
  const orders = useSavedOrders().slice(0, SHOWN);

  return (
    <main className="app-screen">
      <h1 className="app-title">My orders</h1>
      {!hydrated ? (
        <div aria-busy="true" className="mt-6 space-y-3">
          <div className="app-skeleton h-20 w-full" />
          <div className="app-skeleton h-20 w-full" />
        </div>
      ) : orders.length === 0 ? (
        <div className="app-card mt-6 p-6 text-center">
          <p className="app-heading">No orders yet</p>
          <p className="app-muted mt-2 leading-7">
            Scan the QR code on your table, pick your dishes, and follow your order right here.
          </p>
          <Link href="/app/menu" className="app-btn app-btn-primary mt-5">
            Browse the menu
          </Link>
        </div>
      ) : (
        <ul className="app-stagger mt-6 space-y-3">
          {orders.map((order) => (
            <OrderRow key={order.token} order={order} />
          ))}
        </ul>
      )}
    </main>
  );
}

function OrderRow({ order }: { order: SavedOrder }) {
  const state = usePublicOrder(order.token);
  const view = state.kind === "ready" ? state.order : null;
  const active = view && view.status !== "completed" && view.status !== "cancelled";

  if (state.kind === "missing") return null;

  return (
    <li>
      <Link
        href={`/app/orders/${order.token}`}
        className="app-card flex items-center gap-4 p-4 transition-transform active:scale-[0.99]"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="font-semibold">Order #{order.number}</span>
            {view && (
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  active ? "bg-[var(--app-badge-bg)] text-[var(--app-badge-text)]" : "bg-[var(--line)] text-[var(--foreground)]"
                }`}
              >
                {STATUS_LABEL[view.status]}
              </span>
            )}
          </span>
          {view ? (
            <span className="app-muted mt-1 block truncate text-sm">
              {view.lines.map((line) => `${line.quantity}× ${line.name}`).join(", ")}
            </span>
          ) : (
            <span className="app-skeleton mt-2 block h-3.5 w-40" />
          )}
          <span className="app-muted mt-1 block text-xs">
            {new Date(order.placedAt).toLocaleString("en-IN", {
              day: "numeric",
              month: "short",
              hour: "numeric",
              minute: "2-digit",
              timeZone: CAFE_TIME_ZONE,
            })}
            {view ? ` · ${formatPaise(view.totalPaise)}` : ""}
          </span>
        </span>
        <span aria-hidden="true" className="app-go text-xl">
          ›
        </span>
      </Link>
    </li>
  );
}
