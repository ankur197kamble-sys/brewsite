"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { STATUS_LABEL } from "@/app/lib/orders";
import { forgetInstallEvent, useInstallEvent } from "./install";
import { useHydrated, useSavedOrders, useTable } from "./storage";
import { usePublicOrder, type OrderState } from "./use-order";

function activeOrder(state: OrderState) {
  return state.kind === "ready" && state.order.status !== "completed" && state.order.status !== "cancelled"
    ? state.order
    : null;
}

/**
 * The order card: an order in progress, else how to start ordering. The
 * three newest orders are checked, because a quick coffee ordered after a
 * meal can finish first while the meal is still being made.
 */
export function OrderStart({ hasMenu }: { hasMenu: boolean }) {
  const hydrated = useHydrated();
  const table = useTable();
  const saved = useSavedOrders();
  const first = usePublicOrder(saved[0]?.token ?? null);
  const second = usePublicOrder(saved[1]?.token ?? null);
  const third = usePublicOrder(saved[2]?.token ?? null);
  const live = activeOrder(first) ?? activeOrder(second) ?? activeOrder(third);
  // Until the saved orders have answered, an order in progress may be among
  // them: wait rather than show "Start your order" and then swap it out.
  const checking = [first, second, third].some((state) => state.kind === "loading");

  if (!hydrated || (!live && checking)) {
    return <div aria-busy="true" className="app-skeleton h-40 w-full rounded-[var(--app-radius)]" />;
  }

  if (live) {
    return (
      <Link
        href={`/app/orders/${live.token}`}
        className="app-card flex items-center gap-4 p-5 transition-transform active:scale-[0.99]"
      >
        <span aria-hidden="true" className="relative flex h-3 w-3 shrink-0">
          <span className="absolute inset-0 animate-ping rounded-full bg-[var(--accent)] opacity-60 motion-reduce:animate-none" />
          <span className="relative h-3 w-3 rounded-full bg-[var(--accent)]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="app-label block">Order #{live.number}</span>
          <span className="app-heading mt-1 block">{STATUS_LABEL[live.status]}</span>
          <span className="app-muted block text-sm">{live.tableLabel} · tap to follow</span>
        </span>
        <span aria-hidden="true" className="app-muted text-xl">
          ›
        </span>
      </Link>
    );
  }

  if (!hasMenu) {
    return (
      <p className="app-card app-muted p-5">The menu is being updated. Please check back soon.</p>
    );
  }

  return (
    <section className="app-card p-5" aria-labelledby="order-heading">
      <p className="app-label">{table ? table.label : "Order from your table"}</p>
      <h2 id="order-heading" className="app-heading mt-1">
        {table ? "Ready when you are" : "Scan, order, relax"}
      </h2>
      <p className="app-muted mt-1.5 text-[0.95rem] leading-6">
        {table
          ? "Pick your dishes and send the order to the kitchen. Pay at the counter."
          : "Scan the QR code on your table to order from your phone. Browse the menu any time."}
      </p>
      <Link href="/app/menu" className={`app-btn mt-4 ${table ? "app-btn-accent" : "app-btn-primary"}`}>
        {table ? "Start your order" : "Browse the menu"}
      </Link>
    </section>
  );
}

function subscribeStandalone(callback: () => void) {
  const query = window.matchMedia("(display-mode: standalone)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

const noSubscribe = () => () => {};
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

/**
 * "Install app": a real button where the browser supports it (Android
 * Chrome), the Share → Add to Home Screen steps on iPhone, and nothing at
 * all once the app is installed.
 */
export function InstallPrompt({ name }: { name: string }) {
  const installed = useSyncExternalStore(subscribeStandalone, isStandalone, () => true);
  const ios = useSyncExternalStore(noSubscribe, isIos, () => false);
  // Caught by ./install from the first page the customer opened.
  const installEvent = useInstallEvent();

  if (installed || (!installEvent && !ios)) return null;

  return (
    <section className="rounded-[var(--app-radius)] border border-dashed border-[var(--line)] p-5" aria-labelledby="install-heading">
      <h2 id="install-heading" className="font-semibold">
        Add {name} to your home screen
      </h2>
      {installEvent ? (
        <>
          <p className="app-muted mt-1 text-sm leading-6">One tap to order next time, just like an app.</p>
          <button
            type="button"
            className="app-btn app-btn-primary mt-4"
            onClick={async () => {
              await installEvent.prompt();
              await installEvent.userChoice.catch(() => null);
              forgetInstallEvent();
            }}
          >
            Install app
          </button>
        </>
      ) : (
        <p className="app-muted mt-1 text-sm leading-6">
          Tap <strong className="text-[var(--foreground)]">Share</strong>, then{" "}
          <strong className="text-[var(--foreground)]">Add to Home Screen</strong>.
        </p>
      )}
    </section>
  );
}
