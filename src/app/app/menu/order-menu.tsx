"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatPaise, MAX_ITEM_QUANTITY } from "@/app/lib/orders";
import type { AppMenuSection } from "../data";
import { cartSummary } from "../cart";
import { pruneCart, saveCart, useCart, useHydrated, useTable, type Cart } from "../storage";

type FocusTarget = { id: number; to: "add" | "plus" };

/** A section counts as being read once its top passes under the sticky header. */
const HEADER_OFFSET = 150;
/** After a chip is tapped, keep it highlighted while the page scrolls there. */
const CHIP_HOLD_MS = 900;

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Browse the menu; with a scanned table, add dishes with + and −. */
export function OrderMenu({ menu }: { menu: AppMenuSection[] }) {
  const hydrated = useHydrated();
  const table = useTable();
  const cart = useCart();
  const summary = useMemo(() => cartSummary(cart, menu), [cart, menu]);
  const [activeId, setActiveId] = useState<number | null>(menu[0]?.id ?? null);
  const chipRefs = useRef(new Map<number, HTMLAnchorElement>());
  const addRefs = useRef(new Map<number, HTMLButtonElement>());
  const plusRefs = useRef(new Map<number, HTMLButtonElement>());
  // "Add" turns into the − / + stepper and back; focus follows, so keyboard
  // and screen-reader users keep their place instead of jumping to the top.
  const pendingFocus = useRef<FocusTarget | null>(null);
  const holdUntil = useRef(0);

  // Highlight the category being read (the last one whose heading has passed
  // under the sticky header), and keep its chip in view. At the very bottom
  // of the page the last category wins, however short it is.
  useEffect(() => {
    const sections = menu
      .map((section) => document.getElementById(`section-${section.id}`))
      .filter((element): element is HTMLElement => element !== null);
    let frame = 0;
    const update = () => {
      frame = 0;
      if (Date.now() < holdUntil.current || sections.length === 0) return;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      const current = atBottom
        ? sections[sections.length - 1]
        : (sections.filter((section) => section.getBoundingClientRect().top <= HEADER_OFFSET).at(-1) ?? sections[0]);
      setActiveId(Number(current.dataset.section));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    // Once now too: the page may open already scrolled (a #section link, a
    // reload, or the browser restoring the scroll position).
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [menu]);

  useEffect(() => {
    if (activeId === null) return;
    chipRefs.current.get(activeId)?.scrollIntoView({
      block: "nearest",
      inline: "center",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [activeId]);

  // Drop dishes that are no longer on the menu (hidden since they were added).
  useEffect(() => {
    const pruned = pruneCart(cart, new Set(menu.flatMap((section) => section.items.map((item) => item.id))));
    if (pruned) saveCart(pruned);
  }, [cart, menu]);

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    (target.to === "plus" ? plusRefs : addRefs).current.get(target.id)?.focus();
  }, [cart]);

  function setQuantity(itemId: number, quantity: number) {
    const previous = cart[itemId] ?? 0;
    const next: Cart = { ...cart };
    const clamped = Math.max(0, Math.min(MAX_ITEM_QUANTITY, quantity));
    if (clamped === 0) delete next[itemId];
    else next[itemId] = clamped;
    if (previous === 0 && clamped > 0) pendingFocus.current = { id: itemId, to: "plus" };
    if (previous > 0 && clamped === 0) pendingFocus.current = { id: itemId, to: "add" };
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
      <div className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--app-bar-bg)] backdrop-blur-xl">
        <div className="flex items-end justify-between px-[var(--app-pad)] pt-5">
          <h1 className="app-title">Menu</h1>
          {hydrated && (
            <p className="app-muted pb-1 text-sm font-medium">{table ? `Ordering · ${table.label}` : "Browsing"}</p>
          )}
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
                  onClick={() => {
                    holdUntil.current = Date.now() + CHIP_HOLD_MS;
                    setActiveId(section.id);
                  }}
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

      {hydrated && !table && (
        <div role="note" className="app-card-dark mx-[var(--app-pad)] mt-4 p-4 text-[0.95rem] leading-6">
          <strong className="font-semibold">Want to order?</strong> Scan the QR code on your table. You can browse
          everything here meanwhile.
        </div>
      )}

      <div className={`app-stagger space-y-9 px-[var(--app-pad)] pt-6 ${summary.count > 0 ? "pb-28" : "pb-6"}`}>
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
                          ref={(element) => {
                            if (element) addRefs.current.set(item.id, element);
                            else addRefs.current.delete(item.id);
                          }}
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
                            <span key={quantity} className="app-bump">
                              {quantity}
                            </span>
                          </span>
                          <button
                            ref={(element) => {
                              if (element) plusRefs.current.set(item.id, element);
                              else plusRefs.current.delete(item.id);
                            }}
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
        <div className="app-rise fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 px-3 pb-3">
          <Link
            href="/app/checkout"
            className="app-btn app-btn-accent mx-auto flex min-h-[3.75rem] max-w-md justify-between rounded-[1.1rem] px-5 text-base"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-[var(--app-cta-text)] px-2 text-sm text-[var(--app-cta-bg)] tabular-nums">
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
