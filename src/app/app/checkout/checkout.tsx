"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { formatPaise, MAX_ITEM_QUANTITY, normalizeIndianMobile, STAMPS_PER_REWARD } from "@/app/lib/orders";
import type { AppMenuSection } from "../data";
import { cartSummary } from "../cart";
import { rememberOrder, saveCart, saveCustomer, useCart, useCustomer, useTable, type Cart } from "../storage";

const fieldClass = "app-field";

function messageFrom(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const { message } = payload as { message?: unknown };
  return typeof message === "string" ? message : null;
}

/** Review the cart, add name (and optionally a number for stamps), place the order. */
export function Checkout({ menu }: { menu: AppMenuSection[] }) {
  const router = useRouter();
  const table = useTable();
  const cart = useCart();
  const saved = useCustomer();
  const summary = useMemo(() => cartSummary(cart, menu), [cart, menu]);

  // Typed values override what the phone remembers from a previous order.
  const [name, setName] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [loyalty, setLoyalty] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameValue = name ?? saved.name;
  const phoneValue = phone ?? saved.phone;
  const loyaltyValue = loyalty ?? saved.loyalty;
  const phoneProblem = loyaltyValue && phoneValue.trim() !== "" && !normalizeIndianMobile(phoneValue);

  function setQuantity(itemId: number, quantity: number) {
    const next: Cart = { ...cart };
    const clamped = Math.max(0, Math.min(MAX_ITEM_QUANTITY, quantity));
    if (clamped === 0) delete next[itemId];
    else next[itemId] = clamped;
    saveCart(next);
  }

  async function placeOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!table || busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/public/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableToken: table.token,
          items: summary.lines.map((line) => ({ menuItemId: line.item.id, quantity: line.quantity })),
          customerName: nameValue,
          loyalty: loyaltyValue,
          customerPhone: loyaltyValue ? phoneValue : undefined,
          note,
        }),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setError(messageFrom(payload) ?? "Could not place your order. Please try again.");
        setBusy(false);
        return;
      }

      const { token, number } = (payload as { data: { token: string; number: number } }).data;
      rememberOrder(token, number, loyaltyValue);
      saveCustomer({ name: nameValue.trim(), phone: loyaltyValue ? phoneValue.trim() : "", loyalty: loyaltyValue });
      saveCart({});
      router.replace(`/app/orders/${token}`);
    } catch {
      setError("No connection. Check your internet and try again.");
      setBusy(false);
    }
  }

  if (!table) {
    return (
      <main className="app-screen">
        <h1 className="app-title">Your order</h1>
        <p className="app-muted mt-4 leading-7">
          Scan the QR code on your table to order. Your selection is saved on this phone.
        </p>
        <Link href="/app/menu" className="app-btn app-btn-secondary mt-6">
          Back to the menu
        </Link>
      </main>
    );
  }

  if (summary.count === 0) {
    return (
      <main className="app-screen">
        <h1 className="app-title">Your order</h1>
        <p className="app-muted mt-4">Nothing added yet.</p>
        <Link href="/app/menu" className="app-btn app-btn-primary mt-6">
          Browse the menu
        </Link>
      </main>
    );
  }

  return (
    <main className="app-screen">
      <Link href="/app/menu" className="app-muted inline-flex min-h-11 items-center text-sm font-medium">
        ← Back to menu
      </Link>
      <h1 className="app-title mt-1">Your order</h1>
      <p className="app-muted mt-2">{table.label} · pay at the counter</p>

      <ul className="app-card mt-6 divide-y divide-[var(--line)] px-4">
        {summary.lines.map(({ item, quantity }) => (
          <li key={item.id} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{item.name}</p>
              <p className="app-muted text-sm tabular-nums">{formatPaise(item.pricePaise * quantity)}</p>
            </div>
            <div className="app-stepper" role="group" aria-label={`${item.name} quantity`}>
              <button type="button" onClick={() => setQuantity(item.id, quantity - 1)} aria-label={`One less ${item.name}`}>
                −
              </button>
              <span aria-live="polite" className="w-6 text-center font-semibold tabular-nums">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity(item.id, quantity + 1)}
                disabled={quantity >= MAX_ITEM_QUANTITY}
                aria-label={`One more ${item.name}`}
              >
                +
              </button>
            </div>
          </li>
        ))}
        <li className="flex justify-between py-4 text-lg font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatPaise(summary.totalPaise)}</span>
        </li>
      </ul>

      <form onSubmit={placeOrder} className="mt-6 space-y-5 pb-6">
        {error && (
          <p role="alert" className="rounded-xl border border-red-900/20 bg-red-50 px-4 py-3 text-sm text-red-900">
            {error}
          </p>
        )}

        <div>
          <label htmlFor="customer-name" className="font-semibold">
            Your name
          </label>
          <input
            id="customer-name"
            required
            maxLength={40}
            autoComplete="given-name"
            value={nameValue}
            onChange={(event) => setName(event.target.value)}
            placeholder="So staff can call you"
            className={fieldClass}
          />
        </div>

        <div className="app-card p-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={loyaltyValue}
              onChange={(event) => setLoyalty(event.target.checked)}
              className="mt-1 h-5 w-5 accent-[var(--app-accent-fill)]"
            />
            <span>
              <span className="font-semibold">Collect a loyalty stamp</span>
              <span className="app-muted block text-sm leading-6">
                {STAMPS_PER_REWARD} stamps earn a treat. Your number is used only for stamps.
              </span>
            </span>
          </label>
          {loyaltyValue && (
            <div className="mt-3">
              <label htmlFor="customer-phone" className="text-sm font-semibold">
                Mobile number
              </label>
              <input
                id="customer-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                required
                value={phoneValue}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="98765 43210"
                aria-invalid={phoneProblem || undefined}
                aria-describedby="phone-hint"
                className={fieldClass}
              />
              <p id="phone-hint" className={`mt-1.5 text-xs ${phoneProblem ? "text-red-900" : "app-muted"}`}>
                {phoneProblem ? "Enter a 10-digit Indian mobile number." : "10-digit mobile number."}
              </p>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="order-note" className="font-semibold">
            Note for the kitchen <span className="app-muted font-normal">(optional)</span>
          </label>
          <textarea
            id="order-note"
            rows={2}
            maxLength={200}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Less sugar, no onion…"
            className={`${fieldClass} resize-none`}
          />
        </div>

        <button
          type="submit"
          disabled={busy || !nameValue.trim() || Boolean(phoneProblem)}
          className="app-btn app-btn-accent app-btn-block"
        >
          {busy ? "Placing order…" : `Place order · ${formatPaise(summary.totalPaise)}`}
        </button>
      </form>
    </main>
  );
}
