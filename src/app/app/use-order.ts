"use client";

import { useEffect, useState } from "react";
import type { PublicOrderView } from "@/app/lib/orders";

const POLL_MS = 4000;
/** After a failed request, try again this often (also for one-off reads). */
const RETRY_MS = 6000;

export type OrderState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "error" }
  /** `stale`: the last check failed, so this may be out of date. */
  | { kind: "ready"; order: PublicOrderView; stale: boolean };

const isFinished = (order: PublicOrderView) => order.status === "completed" || order.status === "cancelled";

/**
 * Loads a customer's order by its private token and, while it is still in
 * progress, re-checks every few seconds so status changes appear on their
 * own. Polling pauses while the screen is off or the app is in the
 * background, and resumes the moment it is visible again. A failed check
 * keeps the last good state on screen, marked stale, and keeps retrying.
 */
export function usePublicOrder(token: string | null, { live = true } = {}): OrderState {
  const [result, setResult] = useState<{ token: string; state: OrderState } | null>(null);

  useEffect(() => {
    if (!token) return;
    const current = token;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    let failed = false;

    const set = (state: OrderState) => {
      if (!cancelled) setResult({ token: current, state });
    };

    async function load() {
      clearTimeout(timer);
      try {
        const response = await fetch(`/api/public/orders/${encodeURIComponent(current)}`, { cache: "no-store" });
        if (response.status === 404) return set({ kind: "missing" });
        if (!response.ok) throw new Error(String(response.status));
        const order = ((await response.json()) as { data: PublicOrderView }).data;
        failed = false;
        finished = isFinished(order);
        set({ kind: "ready", order, stale: false });
      } catch {
        failed = true;
        if (!cancelled) {
          setResult((previous) =>
            previous?.token === current && previous.state.kind === "ready"
              ? { token: current, state: { ...previous.state, stale: true } }
              : { token: current, state: { kind: "error" } },
          );
        }
      }
      if (cancelled) return;
      if (failed) timer = setTimeout(tick, RETRY_MS);
      else if (live && !finished) timer = setTimeout(tick, POLL_MS);
    }

    function tick() {
      if (document.visibilityState === "visible") load();
    }

    const onVisible = () => {
      if (document.visibilityState === "visible" && (!finished || failed)) load();
    };

    load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token, live]);

  if (!token) return { kind: "idle" };
  // A result for a different token (the token just changed) is not shown.
  return result?.token === token ? result.state : { kind: "loading" };
}
