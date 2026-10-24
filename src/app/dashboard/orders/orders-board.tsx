"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { formatPaise, maskPhone, type OrderStatus, type StaffOrderView } from "@/app/lib/orders";
import { ConfirmDialog } from "../confirm-dialog";

const POLL_MS = 4000;
const SOUND_KEY = "brewsite.orderSound";

const COLUMNS: { status: OrderStatus; title: string; empty: string }[] = [
  { status: "received", title: "New", empty: "No new orders" },
  { status: "preparing", title: "Preparing", empty: "Nothing in the kitchen" },
  { status: "ready", title: "Ready", empty: "Nothing waiting at the counter" },
];

const NEXT_STEP: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  received: { to: "preparing", label: "Start preparing" },
  preparing: { to: "ready", label: "Mark ready" },
  ready: { to: "completed", label: "Collected & paid" },
};

function minutesAgo(iso: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

/** A short two-tone chime, made in the browser (no audio file to load). */
function chime(context: AudioContext) {
  const start = context.currentTime;
  [880, 1320].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    const at = start + index * 0.18;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.4);
  });
}

function readSoundPreference() {
  try {
    return window.localStorage.getItem(SOUND_KEY) === "on";
  } catch {
    return false;
  }
}

const subscribeNothing = () => () => {};

/**
 * The counter screen. Polls for orders every few seconds (pausing while the
 * tab is hidden), chimes on new ones once sound has been switched on, and
 * moves each order along with one large button.
 */
export function OrdersBoard({ initialOrders }: { initialOrders: StaffOrderView[] }) {
  const router = useRouter();
  const [orders, setOrders] = useState(initialOrders);
  const [connected, setConnected] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<OrderStatus>("received");
  const [cancelling, setCancelling] = useState<StaffOrderView | null>(null);
  const savedSound = useSyncExternalStore(subscribeNothing, readSoundPreference, () => false);
  const [soundChoice, setSoundChoice] = useState<boolean | null>(null);
  const soundOn = soundChoice ?? savedSound;
  const audio = useRef<AudioContext | null>(null);
  // Browsers only play sound after a tap on the page, so even a saved "on"
  // preference needs one tap per visit; this tracks whether that has happened.
  const [audioReady, setAudioReady] = useState(false);
  // Read by the polling loop, which must see the latest choice without restarting.
  const chimeEnabled = useRef(false);
  const seen = useRef(new Set(initialOrders.map((order) => order.id)));

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/orders", { cache: "no-store" });
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) throw new Error(String(response.status));
      const next = ((await response.json()) as { data: { orders: StaffOrderView[] } }).data.orders;
      const fresh = next.filter((order) => order.status === "received" && !seen.current.has(order.id));
      next.forEach((order) => seen.current.add(order.id));
      if (fresh.length > 0 && chimeEnabled.current && audio.current) chime(audio.current);
      setOrders(next);
      setConnected(true);
    } catch {
      setConnected(false);
    }
  }, [router]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      if (document.visibilityState === "visible") {
        await refresh();
        setNow(Date.now());
      }
      timer = setTimeout(loop, POLL_MS);
    };
    timer = setTimeout(loop, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const byStatus = useMemo(() => {
    const groups = new Map<OrderStatus, StaffOrderView[]>();
    for (const order of orders) groups.set(order.status, [...(groups.get(order.status) ?? []), order]);
    // Oldest first within a column: that is the order to serve next.
    for (const list of groups.values()) list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return groups;
  }, [orders]);

  const newCount = byStatus.get("received")?.length ?? 0;
  const today = useMemo(() => {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const done = orders.filter((order) => order.status === "completed" && new Date(order.createdAt) >= start);
    return { count: done.length, totalPaise: done.reduce((sum, order) => sum + order.totalPaise, 0) };
  }, [orders, now]);

  useEffect(() => {
    document.title = newCount > 0 ? `(${newCount}) New orders · BrewSite` : "Orders · BrewSite Dashboard";
  }, [newCount]);

  function enableAudio() {
    audio.current ??= new AudioContext();
    void audio.current.resume();
    chime(audio.current);
    setAudioReady(true);
  }

  function onSoundButton() {
    // Sound saved as on but not yet unlocked this visit: this tap unlocks it.
    const next = soundOn && audioReady ? false : true;
    setSoundChoice(next);
    try {
      window.localStorage.setItem(SOUND_KEY, next ? "on" : "off");
    } catch {
      // Not remembered, but still works for this session.
    }
    if (next) enableAudio();
  }

  const needsUnlock = soundOn && !audioReady;

  useEffect(() => {
    chimeEnabled.current = soundOn && audioReady;
  }, [soundOn, audioReady]);

  async function move(order: StaffOrderView, to: OrderStatus) {
    setBusyId(order.id);
    setError(null);
    try {
      const response = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: to }),
      });
      const payload: { message?: string } | null = await response.json().catch(() => null);
      if (!response.ok) setError(payload?.message ?? "Could not update the order");
      else setOrders((current) => current.map((o) => (o.id === order.id ? { ...o, status: to } : o)));
      await refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  const finished = orders.filter((order) => order.status === "completed" || order.status === "cancelled");

  return (
    <>
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm tracking-[0.25em] text-black/55 uppercase">Orders</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">Live orders</h1>
          <p className="mt-3 flex items-center gap-2 text-black/60">
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${connected ? "bg-green-700 motion-safe:animate-pulse" : "bg-red-700"}`}
            />
            {connected ? "Live: updates every few seconds" : "Reconnecting…"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-2xl border border-black/10 bg-white/60 px-4 py-2 text-sm">
            <span className="text-black/55">Collected today</span>{" "}
            <strong className="tabular-nums">
              {today.count} · {formatPaise(today.totalPaise)}
            </strong>
          </div>
          <button
            type="button"
            onClick={onSoundButton}
            aria-pressed={soundOn}
            className={`min-h-11 rounded-full px-5 text-sm font-semibold transition ${
              soundOn && !needsUnlock ? "bg-[#1f1a17] text-white" : "border border-black/15 hover:bg-black/5"
            }`}
          >
            {needsUnlock ? "Tap to enable sound" : soundOn ? "Sound on" : "Turn on new-order sound"}
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-6 rounded-xl border border-red-900/20 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </p>
      )}

      {/* Phones, tablets and small laptops: one column at a time, chosen with tabs. Wide screens: all three. */}
      <div role="tablist" aria-label="Order status" className="mt-8 grid grid-cols-3 gap-2 xl:hidden">
        {COLUMNS.map((column) => {
          const count = byStatus.get(column.status)?.length ?? 0;
          return (
            <button
              key={column.status}
              type="button"
              role="tab"
              aria-selected={tab === column.status}
              onClick={() => setTab(column.status)}
              className={`min-h-12 rounded-xl text-sm font-semibold transition ${
                tab === column.status ? "bg-[#1f1a17] text-white" : "border border-black/10 bg-white/60"
              }`}
            >
              {column.title} <span className="tabular-nums">({count})</span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 grid gap-6 xl:mt-8 xl:grid-cols-3">
        {COLUMNS.map((column) => {
          const list = byStatus.get(column.status) ?? [];
          return (
            <section
              key={column.status}
              aria-labelledby={`col-${column.status}`}
              className={tab === column.status ? "block" : "hidden xl:block"}
            >
              <h2 id={`col-${column.status}`} className="mb-3 hidden items-center justify-between text-sm font-semibold tracking-[0.15em] text-black/55 uppercase xl:flex">
                {column.title}
                <span className="rounded-full bg-black/5 px-2.5 py-0.5 tabular-nums">{list.length}</span>
              </h2>
              {list.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-black/15 p-6 text-center text-sm text-black/50">
                  {column.empty}
                </p>
              ) : (
                <ul className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-1">
                  {list.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      now={now}
                      busy={busyId === order.id}
                      onMove={move}
                      onCancel={() => setCancelling(order)}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {orders.length === 0 && (
        <div className="mt-10 rounded-2xl border border-black/10 bg-white/60 p-6">
          <h2 className="text-lg font-semibold">Waiting for the first order</h2>
          <p className="mt-2 text-black/60">
            Orders appear here as customers scan a table QR code and order. Set up your tables and print their QR codes
            under{" "}
            <Link href="/dashboard/tables" className="font-semibold underline underline-offset-4">
              Tables &amp; QR
            </Link>
            .
          </p>
        </div>
      )}

      {finished.length > 0 && (
        <details className="mt-10 rounded-2xl border border-black/10 bg-white/50 p-5">
          <summary className="cursor-pointer font-semibold">
            Finished in the last 12 hours <span className="text-black/50">({finished.length})</span>
          </summary>
          <ul className="mt-4 divide-y divide-black/10 text-sm">
            {finished.map((order) => (
              <li key={order.id} className="flex flex-wrap justify-between gap-2 py-2.5">
                <span>
                  <strong>#{order.number}</strong> · {order.tableLabel} · {order.customerName}
                </span>
                <span className="tabular-nums text-black/60">
                  {order.status === "cancelled" ? "Cancelled" : formatPaise(order.totalPaise)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <ConfirmDialog
        open={cancelling !== null}
        title="Cancel this order?"
        message={cancelling ? `Order #${cancelling.number} for ${cancelling.customerName} will be cancelled. The customer's phone will show it as cancelled.` : ""}
        confirmLabel="Cancel order"
        busy={busyId !== null}
        onConfirm={async () => {
          if (cancelling) await move(cancelling, "cancelled");
          setCancelling(null);
        }}
        onCancel={() => setCancelling(null)}
      />
    </>
  );
}

function OrderCard({
  order,
  now,
  busy,
  onMove,
  onCancel,
}: {
  order: StaffOrderView;
  now: number;
  busy: boolean;
  onMove: (order: StaffOrderView, to: OrderStatus) => void;
  onCancel: () => void;
}) {
  const next = NEXT_STEP[order.status];
  const ageMinutes = (now - new Date(order.createdAt).getTime()) / 60000;
  const late = order.status !== "ready" && ageMinutes > 15;

  return (
    <li className={`rounded-2xl border bg-white p-5 shadow-sm ${late ? "border-amber-600/50" : "border-black/10"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-2xl font-semibold tracking-tight tabular-nums">#{order.number}</p>
          <p className="mt-0.5 font-medium">
            {order.tableLabel} · {order.customerName}
          </p>
        </div>
        <p className={`text-right text-sm ${late ? "font-semibold text-amber-800" : "text-black/55"}`}>
          {minutesAgo(order.createdAt, now)}
          {late && <span className="block text-xs">Waiting a while</span>}
        </p>
      </div>

      <ul className="mt-4 space-y-1.5">
        {order.lines.map((line) => (
          <li key={line.name} className="flex gap-3 text-[0.95rem]">
            <span className="min-w-7 font-semibold tabular-nums">{line.quantity}×</span>
            <span>{line.name}</span>
          </li>
        ))}
      </ul>

      {order.note && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <strong>Note:</strong> {order.note}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-black/10 pt-3 text-sm">
        <span className="font-semibold tabular-nums">{formatPaise(order.totalPaise)}</span>
        {order.customerPhone && <span className="text-black/55">★ Stamp · {maskPhone(order.customerPhone)}</span>}
      </div>

      {next && (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => onMove(order, next.to)}
            disabled={busy}
            className="min-h-12 flex-1 rounded-xl bg-[#1f1a17] px-4 font-semibold text-white transition hover:opacity-85 active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? "Updating…" : next.label}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-12 rounded-xl border border-black/15 px-4 text-sm font-medium transition hover:bg-black/5 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      )}
    </li>
  );
}
