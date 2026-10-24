"use client";

import { useState, type FormEvent } from "react";
import { maskPhone, STAMPS_PER_REWARD, stampsOnCard, type LoyaltyView } from "@/app/lib/orders";
import { ConfirmDialog } from "../confirm-dialog";

function errorMessage(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const { message } = payload as { message?: unknown };
  return typeof message === "string" ? message : null;
}

/** Look up a customer by mobile number, see their stamps, redeem a treat. */
export function LoyaltyLookup() {
  const [phone, setPhone] = useState("");
  const [card, setCard] = useState<LoyaltyView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function lookUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/loyalty?phone=${encodeURIComponent(phone)}`, { cache: "no-store" });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setCard(null);
        setError(errorMessage(payload) ?? "Could not look up that number");
      } else {
        setCard((payload as { data: LoyaltyView }).data);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function redeem() {
    if (!card) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/loyalty/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: card.phone }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) setError(errorMessage(payload) ?? "Could not redeem");
      else {
        setCard((payload as { data: LoyaltyView }).data);
        setNotice("Treat redeemed. Enjoy!");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  const filled = card ? stampsOnCard(card.stamps, card.rewardsAvailable) : 0;

  return (
    <div className="mt-8 max-w-xl">
      <form onSubmit={lookUp} className="flex flex-col gap-3 rounded-2xl border border-black/10 bg-white/60 p-5 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="loyalty-phone" className="text-sm font-medium">
            Customer&apos;s mobile number
          </label>
          <input
            id="loyalty-phone"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="98765 43210"
            className="mt-2 w-full rounded-xl border border-black/15 bg-white px-4 py-3 text-base outline-none focus:border-black/40"
          />
        </div>
        <button
          type="submit"
          disabled={busy || phone.trim().length < 10}
          className="min-h-12 rounded-full bg-[#1f1a17] px-6 text-sm font-semibold text-white transition hover:opacity-85 disabled:opacity-40"
        >
          {busy ? "Looking up…" : "Look up"}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-red-900/20 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </p>
      )}
      {notice && !error && (
        <p role="status" className="mt-4 rounded-xl border border-green-900/20 bg-green-50 px-4 py-3 text-sm text-green-900">
          {notice}
        </p>
      )}

      {card && (
        <section aria-live="polite" className="mt-6 rounded-2xl bg-[#27201c] p-6 text-[#fffaf3]">
          <p className="text-xs font-semibold tracking-[0.2em] text-[#e8b995] uppercase">{maskPhone(card.phone)}</p>
          <p className="mt-2 text-2xl font-semibold">
            {card.stamps === 0
              ? "No stamps yet"
              : card.rewardsAvailable > 0
                ? `${card.rewardsAvailable} treat${card.rewardsAvailable === 1 ? "" : "s"} ready to redeem`
                : `${filled} of ${STAMPS_PER_REWARD} stamps towards the next treat`}
          </p>
          <ol className="mt-5 grid grid-cols-10 gap-1.5" aria-label={`${filled} of ${STAMPS_PER_REWARD} stamps`}>
            {Array.from({ length: STAMPS_PER_REWARD }, (_, index) => (
              <li
                key={index}
                className={`aspect-square rounded-full border ${index < filled ? "border-[#e8b995] bg-[#e8b995]" : "border-white/25"}`}
              />
            ))}
          </ol>
          <p className="mt-4 text-sm text-white/70">
            {card.stamps} stamp{card.stamps === 1 ? "" : "s"} in total · {card.rewardsRedeemed} treat
            {card.rewardsRedeemed === 1 ? "" : "s"} redeemed
          </p>
          {card.rewardsAvailable > 0 && (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={busy}
              className="mt-5 min-h-12 rounded-full bg-[#e8b995] px-6 font-semibold text-[#27201c] transition hover:opacity-90 disabled:opacity-50"
            >
              Redeem a treat
            </button>
          )}
        </section>
      )}

      <ConfirmDialog
        open={confirming}
        title="Redeem a treat?"
        message={card ? `This uses one treat for ${maskPhone(card.phone)}. Hand over the treat after confirming.` : ""}
        confirmLabel="Redeem"
        busy={busy}
        onConfirm={redeem}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
