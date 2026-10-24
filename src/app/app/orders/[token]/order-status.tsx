"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import {
  formatPaise,
  STAMPS_PER_REWARD,
  stampsTowardsNext,
  type OrderStatus,
  type PublicOrderView,
} from "@/app/lib/orders";
import { usePublicOrder } from "../../use-order";

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: "received", label: "Received" },
  { status: "preparing", label: "Preparing" },
  { status: "ready", label: "Ready" },
];

const HEADLINE: Record<OrderStatus, { title: string; detail: string }> = {
  received: { title: "Order received", detail: "The kitchen has your order and will start on it shortly." },
  preparing: { title: "Being prepared", detail: "Your order is being made fresh right now." },
  ready: { title: "Ready to collect", detail: "Please collect your order from the counter." },
  completed: { title: "Enjoy!", detail: "Thank you for ordering. We hope to see you again soon." },
  cancelled: { title: "Order cancelled", detail: "This order was cancelled. Please ask the staff if this is unexpected." },
};

function stepState(order: OrderStatus, step: OrderStatus): "done" | "current" | "todo" {
  if (order === "completed") return "done";
  const orderIndex = STEPS.findIndex((s) => s.status === order);
  const stepIndex = STEPS.findIndex((s) => s.status === step);
  if (stepIndex < orderIndex) return "done";
  return stepIndex === orderIndex ? "current" : "todo";
}

/** Live order tracking: updates on its own as staff move the order along. */
export function OrderStatusView({ token }: { token: string }) {
  const state = usePublicOrder(token);
  const order = state.kind === "ready" ? state.order : null;
  const previous = useRef<OrderStatus | null>(null);

  // A buzz and a title change when the order becomes ready, like a native app.
  useEffect(() => {
    if (!order) return;
    if (previous.current && previous.current !== "ready" && order.status === "ready") {
      navigator.vibrate?.([120, 80, 120]);
    }
    previous.current = order.status;
    document.title = order.status === "ready" ? `Ready! Order #${order.number}` : `Order #${order.number}`;
  }, [order]);

  if (state.kind === "missing") {
    return (
      <main className="app-screen">
        <h1 className="app-title">Order not found</h1>
        <p className="app-muted mt-4 leading-7">This link is not valid. Your recent orders are under Orders.</p>
        <Link href="/app/orders" className="app-btn app-btn-primary mt-6">
          My orders
        </Link>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="app-screen" aria-busy="true">
        <div className="app-skeleton h-4 w-24" />
        <div className="app-skeleton mt-4 h-10 w-56" />
        <div className="app-skeleton mt-8 h-24 w-full" />
        <div className="app-skeleton mt-4 h-48 w-full" />
        {state.kind === "error" && (
          <p role="alert" className="app-muted mt-6 text-sm">
            No connection. We&apos;ll keep trying.
          </p>
        )}
      </main>
    );
  }

  const headline = HEADLINE[order.status];
  const active = order.status !== "completed" && order.status !== "cancelled";

  return (
    <main className="app-screen">
      <p className="app-label">
        Order #{order.number} · {order.tableLabel}
      </p>

      <div aria-live="polite" aria-atomic="true">
        <h1 className="app-title mt-2">{headline.title}</h1>
        <p className="app-muted mt-2 leading-7">{headline.detail}</p>
      </div>

      {order.status === "ready" && (
        <section aria-label="Collection ticket" className="app-ticket mt-6 px-5 pt-5 pb-6 text-center">
          <p className="text-[0.7rem] font-semibold tracking-[0.18em] uppercase">Show this at the counter</p>
          <p className="font-display mt-2 text-7xl leading-none tracking-tight tabular-nums">#{order.number}</p>
          <p className="mt-3 font-semibold">
            {order.customerName} · {order.tableLabel}
          </p>
        </section>
      )}

      {order.status !== "cancelled" && (
        <section aria-label="Progress" className="app-card mt-6 px-5 py-5">
          <ol className="flex items-center">
            {STEPS.map((step, index) => {
              const current = stepState(order.status, step.status);
              return (
                <li key={step.status} className={`flex items-center ${index < STEPS.length - 1 ? "flex-1" : ""}`}>
                  <span className="flex flex-col items-center gap-2">
                    <span className="app-progress-dot" data-state={current} />
                    <span
                      className={`text-xs font-semibold ${current === "todo" ? "app-muted" : ""}`}
                      aria-current={current === "current" ? "step" : undefined}
                    >
                      {step.label}
                    </span>
                  </span>
                  {index < STEPS.length - 1 && (
                    <span
                      className="app-progress-line mx-2 mb-6"
                      data-state={stepState(order.status, STEPS[index + 1].status) === "todo" ? "todo" : "done"}
                    />
                  )}
                </li>
              );
            })}
          </ol>
          {active && (
            <p className="app-muted mt-4 flex items-center gap-2 text-xs">
              <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)] motion-reduce:animate-none" />
              Updates automatically
            </p>
          )}
        </section>
      )}

      <OrderDetails order={order} />

      {order.loyalty && <StampSummary loyalty={order.loyalty} collected={order.status === "completed"} />}

      <div className="mt-6 grid gap-3">
        <Link href="/app/menu" className="app-btn app-btn-primary app-btn-block">
          Order something else
        </Link>
      </div>
    </main>
  );
}

function OrderDetails({ order }: { order: PublicOrderView }) {
  return (
    <section aria-labelledby="details-heading" className="app-card mt-4 px-5 py-4">
      <div className="flex items-baseline justify-between">
        <h2 id="details-heading" className="font-semibold">
          {order.customerName}&apos;s order
        </h2>
        <p className="app-muted text-sm">
          {new Date(order.createdAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}
        </p>
      </div>
      <ul className="mt-2 divide-y divide-[var(--line)]">
        {order.lines.map((line) => (
          <li key={line.name} className="flex justify-between gap-3 py-2.5">
            <span>
              <span className="font-semibold tabular-nums">{line.quantity}×</span> {line.name}
            </span>
            <span className="tabular-nums">{formatPaise(line.unitPricePaise * line.quantity)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-1 flex justify-between border-t border-[var(--line)] pt-3 text-lg font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{formatPaise(order.totalPaise)}</span>
      </div>
      <p className="app-muted mt-1 text-sm">Pay at the counter when you collect.</p>
    </section>
  );
}

function StampSummary({
  loyalty,
  collected,
}: {
  loyalty: NonNullable<PublicOrderView["loyalty"]>;
  collected: boolean;
}) {
  const filled = stampsTowardsNext(loyalty.stamps);
  return (
    <Link href="/app/stamps" className="app-card-dark mt-4 block p-5 transition-transform active:scale-[0.99]">
      <p className="text-[0.7rem] font-semibold tracking-[0.18em] text-[var(--accent-soft)] uppercase">
        Loyalty · ending {loyalty.phone}
      </p>
      <p className="app-heading mt-1">
        {loyalty.rewardsAvailable > 0
          ? `You have ${loyalty.rewardsAvailable} treat${loyalty.rewardsAvailable === 1 ? "" : "s"} to claim!`
          : `${filled} of ${STAMPS_PER_REWARD} stamps`}
      </p>
      <p className="mt-1 text-sm text-white/70">
        {collected ? "This order earned you a stamp. Thank you!" : "Stamps are added when your order is collected."}
      </p>
    </Link>
  );
}
