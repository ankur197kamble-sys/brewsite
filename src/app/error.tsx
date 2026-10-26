"use client";

import Link from "next/link";
import { useEffect, useTransition } from "react";

/**
 * Last line of defence for the public site, sign-in and the dashboard frame.
 * Brand-neutral on purpose: the café's details may be what failed to load.
 */
export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const [retrying, startTransition] = useTransition();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f3eee5] px-6 text-center text-[#201a16]">
      <div className="max-w-sm">
        <p className="app-label">Connection problem</p>
        <h1 className="app-title mt-3">Something didn&apos;t load</h1>
        <p className="app-muted mt-4 leading-7">
          This is usually a brief network hiccup. Please try again in a moment.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => startTransition(() => retry())}
            disabled={retrying}
            className="app-btn app-btn-primary"
          >
            {retrying ? "Trying…" : "Try again"}
          </button>
          <Link href="/" className="app-btn app-btn-secondary">
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
