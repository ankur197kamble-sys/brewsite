"use client";

import Link from "next/link";
import { STAMPS_PER_REWARD, stampsOnCard } from "@/app/lib/orders";
import { useSavedOrders } from "../storage";
import { usePublicOrder } from "../use-order";

function CupIcon({ filled }: { filled: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M5 9h11v4.5a5.5 5.5 0 0 1-11 0zM16 10.5h1.5a2.25 2.25 0 0 1 0 4.5H16" />
    </svg>
  );
}

/**
 * The loyalty card, read through the customer's most recent order that was
 * placed with a loyalty number (stamps are looked up by that private order
 * link, so no one can check stamps by typing someone else's number).
 */
export function StampCard() {
  const withLoyalty = useSavedOrders().find((order) => order.loyalty) ?? null;
  const state = usePublicOrder(withLoyalty?.token ?? null, { live: false });
  const loyalty = state.kind === "ready" ? state.order.loyalty : null;

  if (!withLoyalty || state.kind === "missing" || (state.kind === "ready" && !loyalty)) {
    return (
      <main className="app-screen">
        <h1 className="app-title">Loyalty stamps</h1>
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

  if (!loyalty) {
    return (
      <main className="app-screen" aria-busy="true">
        <div className="app-skeleton h-10 w-56" />
        <div className="app-skeleton mt-6 h-64 w-full" />
      </main>
    );
  }

  const filled = stampsOnCard(loyalty.stamps, loyalty.rewardsAvailable);
  const reward = loyalty.rewardsAvailable > 0;

  return (
    <main className="app-screen">
      <h1 className="app-title">Loyalty stamps</h1>

      <section className="app-card-dark mt-6 overflow-hidden p-6" aria-labelledby="card-heading">
        <p className="text-[0.7rem] font-semibold tracking-[0.18em] text-[var(--accent-soft)] uppercase">
          Number ending {loyalty.phone}
        </p>
        <h2 id="card-heading" className="app-heading mt-2 text-[1.6rem]">
          {reward
            ? `${loyalty.rewardsAvailable} treat${loyalty.rewardsAvailable === 1 ? "" : "s"} ready!`
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
        {loyalty.stamps} stamp{loyalty.stamps === 1 ? "" : "s"} collected in total. Stamps are kept by the café
        against your number.
      </p>
    </main>
  );
}
