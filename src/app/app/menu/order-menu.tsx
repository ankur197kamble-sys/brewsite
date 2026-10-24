"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatPaise, MAX_ITEM_QUANTITY } from "@/app/lib/orders";
import type { AppMenuSection } from "../data";
import { cartSummary } from "../cart";
import { saveCart, useCart, useTable, type Cart } from "../storage";

/** Browse the menu; with a scanned table, add dishes with + and −. */
export function OrderMenu({ menu }: { menu: AppMenuSection[] }) {
  const table = useTable();
  const cart = useCart();
  const summary = useMemo(() => cartSummary(cart, menu), [cart, menu]);
  const [activeId, setActiveId] = useState<number | null>(menu[0]?.id ?? null);
  const chipRefs = useRef(new Map<number, HTMLAnchorElement>());

  // Highlight the category being read, and keep its chip in view.
  useEffect(() => {
    const sections = menu
      .map((section) => document.getElementById(`section-${section.id}`))
      .filter((element): element is HTMLElement => element !== null);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveId(Number(visible.target.getAttribute("data-section")));
      },
      { rootMargin: "-140px 0px -60% 0px" },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [menu]);

  useEffect(() => {
    if (activeId === null) return;
    chipRefs.current.get(activeId)?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [activeId]);

  function setQuantity(itemId: number, quantity: number) {
    const next: Cart = { ...cart };
    const clamped = Math.max(0, Math.min(MAX_ITEM_QUANTITY, quantity));
    if (clamped === 0) delete next[itemId];
    else next[itemId] = clamped;
    saveCart(next);
    // A short tick on phones that support it, like a native app.
    navigator.vibrate?.(8);
  }

  if (menu.length === 0) {
    return (
      <main className="app-screen">
        <h1 className="app-title">Menu</h1>
        <p className="app-muted mt-4">The menu is being updated. Please check back soon.</p>
      </main>
    );
  }

  return (
    <main className="pt-[env(safe-area-inset-top)]">
      <div className="sticky top-0 z-30 border-b border-[var(--line)] bg-[#f3eee5]/92 backdrop-blur-xl">
        <div className="flex items-end justify-between px-[var(--app-pad)] pt-5">
          <h1 className="app-title">Menu</h1>
          <p className="app-muted pb-1 text-sm font-medium">{table ? `Ordering · ${table.label}` : "Browsing"}</p>
        </div>
        <nav aria-label="Menu categories">
          <ul className="flex gap-2 overflow-x-auto px-[var(--app-pad)] py-3 [scrollbar-width:none]">
            {menu.map((section) => (
              <li key={section.id} className="shrink-0">
                <a
                  ref={(element) => {
                    if (element) chipRefs.current.set(section.id, element);
                    else chipRefs.current.delete(section.id);
                  }}
                  href={`#section-${section.id}`}
                  aria-current={activeId === section.id ? "true" : undefined}
                  className="app-chip"
                >
                  {section.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {!table && (
        <div role="note" className="app-card-dark mx-[var(--app-pad)] mt-4 p-4 text-[0.95rem] leading-6">
          <strong className="font-semibold">Want to order?</strong> Scan the QR code on your table. You can browse
          everything here meanwhile.
        </div>
      )}

      <div className={`space-y-9 px-[var(--app-pad)] pt-6 ${summary.count > 0 ? "pb-28" : "pb-6"}`}>
        {menu.map((section) => (
          <section
            key={section.id}
            id={`section-${section.id}`}
            data-section={section.id}
            className="scroll-mt-36"
            aria-labelledby={`heading-${section.id}`}
          >
            <h2 id={`heading-${section.id}`} className="app-heading">
              {section.name}
            </h2>
            <ul className="mt-2 divide-y divide-[var(--line)]">
              {section.items.map((item) => {
                const quantity = cart[item.id] ?? 0;
                return (
                  <li key={item.id} className="flex items-center gap-4 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-[1.02rem] leading-snug font-semibold">{item.name}</p>
                      {item.description && <p className="app-muted mt-1 text-sm leading-6">{item.description}</p>}
                      <p className="mt-1 text-[0.95rem] font-medium tabular-nums">{formatPaise(item.pricePaise)}</p>
                    </div>
                    {table &&
                      (quantity === 0 ? (
                        <button
                          type="button"
                          onClick={() => setQuantity(item.id, 1)}
                          className="app-btn app-btn-secondary min-h-11 px-5"
                        >
                          Add<span className="sr-only"> {item.name}</span>
                        </button>
                      ) : (
                        <div className="app-stepper" role="group" aria-label={`${item.name} quantity`}>
                          <button type="button" onClick={() => setQuantity(item.id, quantity - 1)} aria-label={`One less ${item.name}`}>
                            −
                          </button>
                          <span aria-live="polite" className="w-6 text-center font-semibold tabular-nums">
                            {quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => setQuantity(item.id, quantity + 1)}
                            disabled={quantity >= MAX_ITEM_QUANTITY}
                            aria-label={`One more ${item.name}`}
                          >
                            +
                          </button>
                        </div>
                      ))}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {table && summary.count > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 px-3 pb-3">
          <Link
            href="/app/checkout"
            className="app-btn app-btn-accent mx-auto flex min-h-[3.75rem] max-w-md justify-between rounded-[1.1rem] px-5 text-base"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-white/20 px-2 text-sm tabular-nums">
                {summary.count}
              </span>
              Review order
            </span>
            <span className="tabular-nums">{formatPaise(summary.totalPaise)}</span>
          </Link>
        </div>
      )}
    </main>
  );
}
