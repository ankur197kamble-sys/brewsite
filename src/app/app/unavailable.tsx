"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * Shown instead of demo content when the café's data cannot be loaded.
 * `onRetry` comes from an error boundary; otherwise the page is refreshed.
 */
export function AppUnavailable({ onRetry }: { onRetry?: () => void }) {
  const router = useRouter();
  const [retrying, startTransition] = useTransition();

  return (
    <main className="app-screen flex min-h-[70dvh] flex-col justify-center text-center">
      <p className="app-label">Connection problem</p>
      <h1 className="app-title mt-3">Can&apos;t reach the café right now</h1>
      <p className="app-muted mx-auto mt-4 max-w-xs leading-7">
        Check your mobile data or Wi-Fi and try again. Anything in your order is saved on this phone.
      </p>
      <button
        type="button"
        onClick={() => startTransition(() => (onRetry ? onRetry() : router.refresh()))}
        disabled={retrying}
        className="app-btn app-btn-primary mx-auto mt-8"
      >
        {retrying ? "Trying…" : "Try again"}
      </button>
    </main>
  );
}
