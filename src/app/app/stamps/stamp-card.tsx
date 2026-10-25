"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { STAMPS_PER_REWARD, stampsOnCard, type PublicOrderView } from "@/app/lib/orders";
import { useHydrated, useSavedOrders } from "../storage";

/** How many of this phone's loyalty orders are searched for the card. */
const LOOKBACK = 6;
const RETRY_MS = 6000;
/** While a stamp is on its way, check again now and then. */
const PENDING_POLL_MS = 15000;

type Card = { stamps: number; rewardsAvailable: number };

type CardLookup =
  | { kind: "loading" }
  | { kind: "offline" }
  /** `pending`: numbers of orders still in progress that will earn a stamp. */
  | { kind: "none"; pending: number[] }
  | { kind: "card"; phone: string; card: Card; pending: number[] };

/**
 * Finds the stamp card through this phone's own orders, newest first: the
 * card shows on the first collected one. Every order still in progress
 * (newer or older, with the same number) is listed as a stamp on its way,
 * and re-checked now and then while the screen is visible. A failed check
 * keeps whatever is already on screen.
 */
function useLoyaltyCard(tokens: string[]): CardLookup {
  const key = tokens.slice(0, LOOKBACK).join(",");
  const [result, setResult] = useState<{ key: string; lookup: CardLookup } | null>(null);

  useEffect(() => {
    if (!key) return;
    const list = key.split(",");
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let again = false;

    async function search() {
      clearTimeout(timer);
      const orders: PublicOrderView[] = [];
      try {
        for (const token of list) {
          const response = await fetch(`/api/public/orders/${encodeURIComponent(token)}`, { cache: "no-store" });
          // One unreadable order should not hide the card found through the others.
          if (!response.ok) continue;
          orders.push(((await response.json()) as { data: PublicOrderView }).data);
        }
      } catch {
        // Offline: keep what is on screen, and try again shortly.
        if (cancelled) return;
        setResult((previous) =>
          previous?.key === key && previous.lookup.kind !== "loading" && previous.lookup.kind !== "offline"
            ? previous
            : { key, lookup: { kind: "offline" } },
        );
        again = true;
        timer = setTimeout(tick, RETRY_MS);
        return;
      }
      if (cancelled) return;

      const withCard = orders.find((order) => order.loyalty?.card);
      const inProgress = orders.filter(
        (order) => order.loyalty && !order.loyalty.card && order.status !== "cancelled" && order.status !== "completed",
      );
      let lookup: CardLookup;
      if (withCard?.loyalty?.card) {
        const phone = withCard.loyalty.phone;
        const pending = inProgress.filter((order) => order.loyalty?.phone === phone).map((order) => order.number);
        lookup = { kind: "card", phone, card: withCard.loyalty.card, pending };
      } else {
        lookup = { kind: "none", pending: inProgress.map((order) => order.number) };
      }
      setResult({ key, lookup });
      again = lookup.pending.length > 0;
      if (again) timer = setTimeout(tick, PENDING_POLL_MS);
    }

    function tick() {
      if (document.visibilityState === "visible") search();
    }

    const onVisible = () => {
      if (document.visibilityState === "visible" && again) search();
    };

    search();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [key]);

  if (!key) return { kind: "none", pending: [] };
  return result?.key === key ? result.lookup : { kind: "loading" };
}

function CupIcon({ filled }: { filled: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M5 9h11v4.5a5.5 5.5 0 0 1-11 0zM16 10.5h1.5a2.25 2.25 0 0 1 0 4.5H16" />
    </svg>
  );
}

function Loading({ offline }: { offline: boolean }) {
  return (
    <main className="app-screen" aria-busy="true">
      <div className="app-skeleton h-10 w-56" />
      <div className="app-skeleton mt-6 h-64 w-full" />
      {offline && (
        <p role="status" className="app-muted mt-6 text-sm">
          No connection. We&apos;ll keep trying.
        </p>
      )}
    </main>
  );
}

/**
 * The loyalty card, read through this phone's own order links. The card is
 * only shown through an order that was collected and paid at the counter
 * (see PublicOrderView), so typing someone else's number into an order
 * reveals nothing.
 */
export function StampCard() {
  const hydrated = useHydrated();
  const tokens = useSavedOrders()
    .filter((order) => order.loyalty)
    .map((order) => order.token);
  const lookup = useLoyaltyCard(tokens);

  if (!hydrated || lookup.kind === "loading") return <Loading offline={false} />;
  if (lookup.kind === "offline") return <Loading offline />;

  const loyalty = lookup.kind === "card" ? lookup : null;
  const card = loyalty?.card ?? null;
  const pending = lookup.pending;

  if (!loyalty || !card) {
    return (
      <main className="app-screen">
        <h1 className="app-title">Loyalty stamps</h1>
        <PendingStamps numbers={pending} />
        <div className="app-card-dark mt-6 p-6">
          <p className="app-heading">
            Collect {STAMPS_PER_REWARD} stamps, get a treat on us
          </p>
          <ol className="mt-4 space-y-3 text-[0.95rem] leading-6 text-white/85">
            <li>
              <strong className="text-white">1.</strong> When you place an order, tick{" "}
              <em className="not-italic text-[var(--accent-soft)]">Collect a loyalty stamp</em> and add your mobile number.
            </li>
            <li>
              <strong className="text-white">2.</strong> You get one stamp each time you collect an order.
            </li>
            <li>
              <strong className="text-white">3.</strong> At {STAMPS_PER_REWARD} stamps, show this screen at the counter for your treat.
            </li>
          </ol>
        </div>
        <Link href="/app/menu" className="app-btn app-btn-primary mt-6">
          Start an order
        </Link>
      </main>
    );
  }

  const filled = stampsOnCard(card.stamps, card.rewardsAvailable);
  const reward = card.rewardsAvailable > 0;

  return (
    <main className="app-screen">
      <h1 className="app-title">Loyalty stamps</h1>
      <PendingStamps numbers={pending} />

      <section className="app-card-dark mt-6 overflow-hidden p-6" aria-labelledby="card-heading">
        <p className="text-[0.7rem] font-semibold tracking-[0.18em] text-[var(--accent-soft)] uppercase">
          Number ending {loyalty.phone}
        </p>
        <h2 id="card-heading" className="app-heading mt-2 text-[1.6rem]">
          {reward
            ? `${card.rewardsAvailable} treat${card.rewardsAvailable === 1 ? "" : "s"} ready!`
            : `${STAMPS_PER_REWARD - filled} more to your next treat`}
        </h2>

        <ol
          className="mt-6 grid grid-cols-5 gap-3"
          aria-label={`${filled} of ${STAMPS_PER_REWARD} stamps collected`}
        >
          {Array.from({ length: STAMPS_PER_REWARD }, (_, index) => {
            const on = index < filled;
            return (
              <li
                key={index}
                className={`flex aspect-square items-center justify-center rounded-full border transition-colors ${
                  on
                    ? "border-[var(--accent-soft)] bg-[var(--accent-soft)] text-[var(--surface-deep)]"
                    : "border-white/25 text-white/30"
                }`}
              >
                <CupIcon filled={on} />
              </li>
            );
          })}
        </ol>

        <p className="mt-6 text-sm leading-6 text-white/75">
          {reward
            ? "Show this screen at the counter to claim your treat."
            : "One stamp is added each time you collect an order."}
        </p>
      </section>

      <p className="app-muted mt-4 text-sm leading-6">
        {card.stamps} stamp{card.stamps === 1 ? "" : "s"} collected in total. Stamps are kept by the café
        against your number.
      </p>
    </main>
  );
}

function PendingStamps({ numbers }: { numbers: number[] }) {
  if (numbers.length === 0) return null;
  const list = numbers.map((number) => `#${number}`).join(", ");
  return (
    <p className="app-card mt-6 px-5 py-4 text-[0.95rem] leading-6">
      <strong className="font-semibold">{numbers.length === 1 ? "A stamp is on its way." : `${numbers.length} stamps are on their way.`}</strong>{" "}
      <span className="app-muted">
        You&apos;ll get {numbers.length === 1 ? "it" : "them"} when you collect order {list} at the counter.
      </span>
    </p>
  );
}
